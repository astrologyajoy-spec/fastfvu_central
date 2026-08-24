import { NextResponse, NextRequest } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  const tmpDir = path.resolve(process.cwd(), 'tmp_job');
  
  // ইউনিক টাইমস্ট্যাম্প দিয়ে ফাইল নেম তৈরি যাতে দুটি জব একসাথে ওভারল্যাপ না করে
  const jobPrefix = `job_${Date.now()}`;
  const txtPath = path.join(tmpDir, `${jobPrefix}.txt`);
  const csiPath = path.join(tmpDir, `${jobPrefix}.csi`);
  const errLogPath = path.join(tmpDir, `${jobPrefix}.err`);
  const fvuPath = path.join(tmpDir, `${jobPrefix}.fvu`);

  try {
    const formData = await request.formData();
    
    // ফ্রন্টএন্ড থেকে ফাইল দুটি পড়া
    const txtFile = formData.get('txt_file') as File | formData.get('file') as File;
    const csiFile = formData.get('csi_file') as File | null;

    if (!txtFile) {
      return NextResponse.json({ success: false, error: 'TDS (.txt) file is required.' }, { status: 400 });
    }

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Disk-এ ফাইল রাইট করা
    const txtBuffer = Buffer.from(await txtFile.arrayBuffer());
    fs.writeFileSync(txtPath, txtBuffer);

    let hasCsi = '0';
    if (csiFile && csiFile.size > 0) {
      const csiBuffer = Buffer.from(await csiFile.arrayBuffer());
      fs.writeFileSync(csiPath, csiBuffer);
      hasCsi = '1';
    }

    // ==========================================
    // Java Execution Logic Setup
    // ==========================================
    let jarDir = path.resolve(process.cwd(), 'fvu-tool');
    if (!fs.existsSync(jarDir)) {
      jarDir = path.resolve(process.cwd(), 'bin');
    }

    const mainJarPath = path.join(jarDir, 'TDS_STANDALONE_FVU_1.2.jar');
    
    const jarFiles = fs.readdirSync(jarDir).filter(f => 
      f.endsWith('.jar') && 
      f !== 'TDS_STANDALONE_FVU_1.2.jar' && 
      !f.toLowerCase().includes('versionvalidator')
    );
    const cpArray = [mainJarPath, ...jarFiles.map(j => path.join(jarDir, j)), jarDir];
    const cpString = cpArray.join(path.delimiter);

    const javaOptions = [
      '-Dfile.encoding=UTF-8',
      '-Djava.awt.headless=true',
      '-Djsse.enableSNIExtension=false',
      '--add-modules=jdk.unsupported',
      '--add-exports=jdk.unsupported/sun.misc=ALL-UNNAMED',
      '--add-opens=java.base/java.lang=ALL-UNNAMED',
      '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
      '--add-opens=java.base/java.util=ALL-UNNAMED',
      '--add-opens=java.base/java.text=ALL-UNNAMED',
      '--add-opens=java.base/java.io=ALL-UNNAMED'
    ].join(' ');

    const csiArg = hasCsi === '1' ? `"${csiPath}"` : '0';
    const command = `java ${javaOptions} -cp "${cpString}" com.tin.FVU.FVU "${txtPath}" "${errLogPath}" "${fvuPath}" ${hasCsi} ${csiArg} 0 "Protean RPU 1.2"`;
    
    try {
      await execPromise(command, { cwd: process.cwd() });
    } catch (javaErr) {
      // Background handling
    }

    // ==========================================
    // Response Delivery Logic
    // ==========================================
    if (fs.existsSync(fvuPath)) {
      const fvuContent = fs.readFileSync(fvuPath);
      
      // Cleanup Temp Files
      cleanupFiles([txtPath, csiPath, errLogPath, fvuPath]);

      return new NextResponse(fvuContent, {
        headers: {
          'Content-Disposition': `attachment; filename="${txtFile.name.replace('.txt', '.fvu')}"`,
          'Content-Type': 'application/octet-stream',
        },
      });
    } else if (fs.existsSync(errLogPath)) {
      const errContent = fs.readFileSync(errLogPath, 'utf8');
      
      cleanupFiles([txtPath, csiPath, errLogPath]);

      return NextResponse.json({ 
        success: false, 
        error: 'FVU File Validation Failed.', 
        details: errContent 
      }, { status: 400 });
    } else {
      cleanupFiles([txtPath, csiPath]);
      return NextResponse.json({ success: false, error: 'Java Engine execution failed to produce FVU or Error file.' }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function cleanupFiles(paths: string[]) {
  paths.forEach(p => {
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  });
}
