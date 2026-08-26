import sys
import os
import subprocess
import json
import time

def main():
    """
    Background Automation Bridge
    ----------------------------
    This script serves as the bridge between the Node.js backend and the external processing engine.
    It accepts input file paths, executes the required Java/GUI process, verifies the output,
    and returns a clean JSON response via stdout to the backend server.
    """
    
    # 1. Parse Arguments
    # Expected: automation.py <txtPath> <csiPath> <outDir> <fvuPath> <errPath>
    if len(sys.argv) < 6:
        print(json.dumps({"status": "error", "message": "Missing required file path arguments."}))
        sys.exit(1)

    txt_path = sys.argv[1]
    csi_path = sys.argv[2]
    out_dir = sys.argv[3]
    fvu_path = sys.argv[4]
    err_path = sys.argv[5]

    # Verify input file exists
    if not os.path.exists(txt_path):
        print(json.dumps({"status": "error", "message": f"Input .txt file not found: {txt_path}"}))
        sys.exit(1)

    # 2. Execution Logic
    # ---------------------------------------------------------------------------------
    # NOTE ON GUI AUTOMATION (PyAutoGUI):
    # If executing this in a local Windows/Desktop environment to bypass headless restrictions, 
    # you would use PyAutoGUI here to simulate user clicks on the Java Desktop App:
    # 
    # import pyautogui
    # subprocess.Popen(["java", "-jar", "TDS_STANDALONE_FVU.jar"])
    # time.sleep(5)  # Wait for GUI to load
    # pyautogui.write(txt_path)
    # pyautogui.press('tab')
    # pyautogui.write(err_path)
    # pyautogui.press('tab')
    # pyautogui.write(csi_path if csi_path != '0' else '')
    # pyautogui.press('enter')
    # ---------------------------------------------------------------------------------
    
    # Since server environments are headless, we execute the JAR via its CLI interface.
    # The standard NSDL arguments: <input.txt> <error.err> <output.fvu> 0 <challan.csi> 0 <version>
    
    jar_path = os.environ.get("JAR_PATH", "fvu-tool/TDS_STANDALONE_FVU_1.2.jar")
    
    # Ensure any old files are cleaned before starting
    if os.path.exists(fvu_path):
        os.remove(fvu_path)
    if os.path.exists(err_path):
        os.remove(err_path)

    cmd = [
        "java",
        "-Dfile.encoding=UTF-8",
        "-jar",
        jar_path,
        txt_path,
        err_path,
        fvu_path,
        "0",
        csi_path
    ]

    try:
        # 3. Execute Process
        # We run the command and wait for it to complete (max 3 minutes)
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=180
        )
        
        # 4. Verify Creation of Expected Output Files
        if os.path.exists(fvu_path):
            print(json.dumps({
                "status": "success",
                "message": "FVU generated successfully.",
                "type": "fvu",
                "file": fvu_path
            }))
        elif os.path.exists(err_path):
            print(json.dumps({
                "status": "success",
                "message": "Validation generated an error log.",
                "type": "err",
                "file": err_path
            }))
        else:
            # If neither file was created, execution failed entirely
            print(json.dumps({
                "status": "error",
                "message": "Process completed but no .fvu or .err file was generated.",
                "stdout": result.stdout[:200], # Send snippet of stdout for debugging
                "stderr": result.stderr[:200]
            }))
            sys.exit(1)

    except subprocess.TimeoutExpired:
        print(json.dumps({"status": "error", "message": "Java execution timed out after 3 minutes."}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
