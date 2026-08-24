import { executeQuery } from '@/lib/db';
import { NextResponse, NextRequest } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  const tmpDir = path.resolve(process.cwd(), 'tmp_job');
  const txtPath = path.join(tmpDir, 'data.txt');
  const csiPath = path.join(tmpDir, 'input.csi');
  const errLogPath = path.join(tmpDir, 'data.err');
  const fvuPath = path.join(tmpDir, 'data.fvu');

  let debugStep = "Initialization";

  try {
    // ==========================================
    // ধাপ ০: আপলোডেড ফাইল রিড করা
    // ==========================================
    debugStep = "Step 0: Reading Uploaded CSI File";
    const formData = await request.formData();
    const csiFile = formData.get('csi_file') as File | null;

    if (!csiFile) {
      return NextResponse.json({ success: false, error: 'CSI file missing from request.' }, { status: 400 });
    }

    // ==========================================
    //  ধাপ ১: ডাটাবেস থেকে রেকর্ড তুলে আনা
    // ==========================================
    debugStep = "Step 1: Fetching Database Records";
    let userRes: any = await executeQuery({ query: 'SELECT * FROM tds_users LIMIT 1' });
    let challanRes: any = await executeQuery({ query: 'SELECT * FROM tds_challans' });
    let deducteeRes: any = await executeQuery({ query: 'SELECT * FROM tds_deductees' });

    const usersList = Array.isArray(userRes) ? userRes : (userRes && userRes.rows ? userRes.rows : []);
    const challanList = Array.isArray(challanRes) ? challanRes : (challanRes && challanRes.rows ? challanRes.rows : []);
    const deducteeList = Array.isArray(deducteeRes) ? deducteeRes : (deducteeRes && deducteeRes.rows ? deducteeRes.rows : []);

    const user = usersList[0] || {};
    const activeTan = user.tan_no || "CALC04583F";
    const activeDeductorName = user.deductor_name || "COOCHBEHAR I PANCHAYAT SAMITI";
    const activePan = user.pan_no || "ABCDE1234F";
    const totalChallans = challanList.length > 0 ? challanList.length : 1;

    // ==========================================
    //  ধাপ ২: NSDL Standard টেক্সট ফাইল জেনারেশন
    // ==========================================
    debugStep = "Step 2: TXT File Content Formatting";
    let fileContent = "";
    
    // FH RECORD
    fileContent += `FH^SL^O^26Q^1^^1^${activeTan}^^^^^^^^^^^^1^N^N^^^^^^^^^\n`;

    // BH RECORD
    fileContent += `BH^1^${totalChallans}^26Q^^^^^^${activeTan}^^${activePan}^2025-2026^2026-2027^Q4^${activeDeductorName}^^^^^${user.flat_no || 'NA'}^^^^^^${user.town_city || 'Cooch Behar'}^${user.state || 'West Bengal'}^${user.pin_code || '736170'}^test@test.com^^N^N^^^^^^^K^G^1^^^^^^^^^^^^^\n`;

    // CD & DD RECORD
    if (challanList.length > 0) {
      let cdSerial = 1;
      challanList.forEach((challan: any) => {
        let formattedDate = "26022026"; 
        if (challan.date_of_deposit) {
          const d = new Date(challan.date_of_deposit);
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          formattedDate = `${day}${month}${year}`;
        }

        const formattedBsr = String(challan.bsr_code || '0002271').padStart(7, '0').substring(0, 7);
        const formattedChallanNo = String(challan.challan_no || '12787').padStart(5, '0').substring(0, 5);
        const relatedDeductees = deducteeList.filter((d: any) => d.challan_id === challan.id);
        const deducteeCount = relatedDeductees.length > 0 ? relatedDeductees.length : 1;

        fileContent += `CD^1^${cdSerial}^${deducteeCount}^^^^Y^${formattedChallanNo}^^^${formattedDate}^^${formattedBsr}^${challan.total_amount || '170.00'}^^^^^^^^^${challan.tax_amount || '170.00'}^0.00^0.00^0.00^0.00^^^${challan.section_code || '94C'}^^^^N\n`;

        if (relatedDeductees.length > 0) {
          let ddSerial = 1;
          relatedDeductees.forEach((deductee: any) => {
            fileContent += `DD^1^${cdSerial}^${ddSerial}^^${deductee.deductee_pan || 'ABCDE1234F'}^^${deductee.deductee_name || 'JOHN DOE ENTERPRISE'}^${deductee.amount_paid || '17000.00'}^${deductee.tds_deducted || '170.00'}^^^^^^^^^^^^^^^^${challan.section_code || '94C'}^^^0.00^^^^^^^^\n`;
            ddSerial++;
          });
        } else {
          fileContent += `DD^1^${cdSerial}^1^^ABCDE1234F^^JOHN DOE ENTERPRISE^17000.00^170.00^^^^^^^^^^^^^^^^${challan.section_code || '94C'}^^^0.00^^^^^^^^\n`;
        }
        cdSerial++;
      });
    } else {
      fileContent += `CD^1^1^1^^^^Y^12787^^^26022026^^0002271^170.00^^^^^^^^^170.00^0.00^0.00^0.00^0.00^^^94C^^^^N\n`;
      fileContent += `DD^1^1^1^^ABCDE1234F^^JOHN DOE ENTERPRISE^17000.00^170.00^^^^^^^^^^^^^^^^94C^^^0.00^^^^^^^^\n`;
    }

    // ==========================================
    //  ধাপ ৩: ফাইল রাইটিং প্রসেস
    // ==========================================
    debugStep = "Step 3: Saving Temporary Files";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    if (fs.existsSync(errLogPath)) fs.unlinkSync(errLogPath);
    if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

    fs.writeFileSync(txtPath, fileContent);
    const arrayBuffer = await csiFile.arrayBuffer();
    fs.writeFileSync(csiPath, Buffer.from(arrayBuffer));

    // ==========================================
    //  ধাপ ৪: Standalone Java Execution Engine
    // ==========================================
    debugStep = "Step 4: Executing Standalone Java FVU Engine";
    let jarDir = path.resolve(process.cwd(), 'fvu-tool');
    if (!fs.existsSync(jarDir)) {
      jarDir = path.resolve(process.cwd(), 'bin');
    }

    const mainJarPath = path.join(jarDir, 'TDS_STANDALONE_FVU_1.2.jar');
    
    // Dynamically build Classpath
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

    const command = `java ${javaOptions} -cp "${cpString}" com.tin.FVU.FVU "${txtPath}" "${errLogPath}" "${fvuPath}" 1 "${csiPath}" 0 "Protean RPU 1.2"`;
    
    try {
      await execPromise(command, { cwd: process.cwd() });
    } catch (javaErr) {
      // Background handling
    }

    // ==========================================
    //  ধাপ ৫: রেসপন্স ডেলিভারি
    // ==========================================
    debugStep = "Step 5: Delivering Generated Files";
    if (fs.existsSync(fvuPath)) {
      const fvuContent = fs.readFileSync(fvuPath);
      return new NextResponse(fvuContent, {
        headers: {
          'Content-Disposition': 'attachment; filename="return_file.fvu"',
          'Content-Type': 'application/octet-stream',
        },
      });
    } else if (fs.existsSync(errLogPath)) {
      const errContent = fs.readFileSync(errLogPath, 'utf8');
      return NextResponse.json({ 
        success: false, 
        error: 'Validation failed with errors in return file.', 
        details: errContent 
      }, { status: 400 });
    } else {
      const generatedTxtContent = fs.readFileSync(txtPath);
      return new NextResponse(generatedTxtContent, {
        headers: {
          'Content-Disposition': 'attachment; filename="clean_tds_return.txt"',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, step: debugStep }, { status: 500 });
  }
}
