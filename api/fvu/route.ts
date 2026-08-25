import { NextResponse, NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ১. ফ্রন্টএন্ড থেকে ফাইল দুটি পড়া (আপনার অরিজিনাল লজিক)
    const txtFile = (formData.get('txt_file') || formData.get('file')) as File | null;
    const csiFile = formData.get('csi_file') as File | null;

    if (!txtFile) {
      return NextResponse.json(
        { success: false, error: 'TDS (.txt) file is required.' },
        { status: 400 }
      );
    }

    // ২. ফাইলের বিষয়বস্তু রিড করা
    const txtContent = await txtFile.text();
    const csiContent = csiFile && csiFile.size > 0 ? await csiFile.text() : '';

    // ৩. Octokit দিয়ে GitHub Actions Dispatch জেনারেট করা
    const octokit = new Octokit({
      auth: process.env.GITHUB_PAT,
    });

    const jobId = `job_${Date.now()}`;

    await octokit.repos.createDispatchEvent({
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      event_type: 'generate-fvu',
      client_payload: {
        txt_filename: txtFile.name,
        txt_content: txtContent,
        csi_filename: csiFile ? csiFile.name : '',
        csi_content: csiContent,
        jobId: jobId,
      },
    });

    // ৪. সাকসেস রেসপন্স (সার্ভারলেস সেফ)
    return NextResponse.json({
      success: true,
      status: 'PENDING',
      jobId: jobId,
      message: 'FVU generation job successfully dispatched to GitHub Actions Cloud Runner.',
    });

  } catch (error: any) {
    console.error('FVU Processing Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Server execution failed.' },
      { status: 500 }
    );
  }
}
