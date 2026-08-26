import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;

public class FVUGUIAutomator {
    public static void main(String[] args) {
        System.out.println("=========================================================");
        System.out.println("   NSDL FVU Direct In-Memory Java Reflection Engine     ");
        System.out.println("=========================================================");

        if (args.length < 3) {
            System.err.println("Usage: java FVUGUIAutomator <txtPath> <errPath> <csiPath>");
            System.exit(1);
        }

        final String txtPath = args[0];
        final String errPath = args[1];
        final String csiPath = args[2];

        System.out.println("[Reflection Engine] Input TXT Path: " + txtPath);
        System.out.println("[Reflection Engine] Error/Output Log Path: " + errPath);
        System.out.println("[Reflection Engine] CSI Challan Path: " + csiPath);

        final String expectedFvu = errPath.replaceAll("\\.err$", ".fvu");
        final String safeCsi = (csiPath == null || csiPath.trim().isEmpty() || csiPath.equals("0")) ? "0" : csiPath;

        try {
            // Step 1: Reflectively inspect com.tin.FVU.FVU class directly in JVM memory
            System.out.println("[Reflection Engine] Loading class 'com.tin.FVU.FVU' into JVM memory...");
            Class<?> fvuClass = Class.forName("com.tin.FVU.FVU");
            System.out.println("[Reflection Engine] Successfully loaded class: " + fvuClass.getName());

            // List available methods for diagnostics
            Method[] methods = fvuClass.getDeclaredMethods();
            System.out.println("[Reflection Engine] Found " + methods.length + " declared methods in com.tin.FVU.FVU:");
            for (Method m : methods) {
                if (Modifier.isPublic(m.getModifiers()) && Modifier.isStatic(m.getModifiers())) {
                    System.out.println("  -> Public Static Method: " + m.getName() + Arrays.toString(m.getParameterTypes()));
                }
            }

            // Step 2: Locate the main method reflectively
            Method mainMethod = fvuClass.getMethod("main", String[].class);
            mainMethod.setAccessible(true);

            // Version parameters to attempt in-memory. 
            // We prioritize "1.2" for TDS_STANDALONE_FVU_1.2.jar, then fallback to others.
            String[] versionsToTry = new String[] {
                "1.2", "8.5", "8.6", "8.7", "8.4", "8.8", "8.9", "8.0", "8.1", "8.2", "8.3", ""
            };

            boolean success = false;

            // Step 3: Invoke validation engine directly in-memory with parameter signatures
            for (String version : versionsToTry) {
                System.out.println("\n[Reflection Engine] Attempting in-memory invocation with Version: '" + version + "'...");
                
                // Signature A: 7 parameters (txt, err, fvu, htmlFlag, csiPath, consolidatedFlag, version)
                String[] params7 = new String[] {
                    txtPath,
                    errPath,
                    expectedFvu,
                    "0",
                    safeCsi,
                    "0",
                    version
                };

                try {
                    mainMethod.invoke(null, (Object) params7);
                } catch (Throwable t) {
                    System.err.println("[Reflection Engine] Invocation note: " + (t.getCause() != null ? t.getCause().getMessage() : t.getMessage()));
                }

                // Check if files were created
                if (new File(expectedFvu).exists() || isNonEmptyErrorLog(errPath, version)) {
                    System.out.println("[Reflection Engine] SUCCESS: Validation completed in-memory for version '" + version + "'!");
                    success = true;
                    break;
                }

                // Signature B: 6 parameters
                String[] params6 = new String[] {
                    txtPath,
                    errPath,
                    expectedFvu,
                    safeCsi,
                    "0",
                    version
                };

                try {
                    mainMethod.invoke(null, (Object) params6);
                } catch (Throwable t) {
                    // Suppress individual signature notes
                }

                if (new File(expectedFvu).exists() || isNonEmptyErrorLog(errPath, version)) {
                    System.out.println("[Reflection Engine] SUCCESS: Validation completed in-memory for version '" + version + "'!");
                    success = true;
                    break;
                }
            }

            // Step 4: Fallback - Search for alternative static methods in com.tin.FVU classes if needed
            if (!success && !new File(expectedFvu).exists() && !isNonEmptyErrorLog(errPath, null)) {
                System.out.println("\n[Reflection Engine] Fallback: Searching for secondary static engine methods in memory...");
                for (Method m : methods) {
                    if (Modifier.isStatic(m.getModifiers()) && !m.getName().equals("main")) {
                        Class<?>[] pTypes = m.getParameterTypes();
                        if (pTypes.length == 1 && pTypes[0] == String[].class) {
                            System.out.println("[Reflection Engine] Invoking secondary method: " + m.getName() + "(String[])");
                            try {
                                m.setAccessible(true);
                                m.invoke(null, (Object) new String[]{ txtPath, errPath, expectedFvu, safeCsi });
                            } catch (Throwable ignored) {}
                        }
                    }
                    if (new File(expectedFvu).exists() || isNonEmptyErrorLog(errPath, null)) {
                        break;
                    }
                }
            }

            // Step 5: Output report
            checkAndReportOutput(expectedFvu, errPath);

        } catch (Throwable t) {
            System.err.println("[Reflection Engine] Fatal Exception during in-memory reflection: " + t.getMessage());
            t.printStackTrace();
            checkAndReportOutput(expectedFvu, errPath);
        } finally {
            System.exit(0);
        }
    }

    private static boolean isNonEmptyErrorLog(String errPath, String expectedVersion) {
        File f = new File(errPath);
        if (!f.exists() || f.length() == 0) {
            return false;
        }
        
        // Check if the error log contains the "Incorrect FVU Version of JAR" message.
        // If it does, and we are trying different versions, we should return false to keep trying.
        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (line.contains("Incorrect FVU Version of JAR") || line.contains("Invalid Version")) {
                    return false; // This version string failed the internal check
                }
            }
        } catch (Exception e) {
            // Ignore read errors here
        }
        return true;
    }

    private static void checkAndReportOutput(String fvuPath, String errPath) {
        File fvuFile = new File(fvuPath);
        File errFile = new File(errPath);

        if (fvuFile.exists()) {
            System.out.println("\n[Reflection Engine] .fvu File Successfully Created: " + fvuFile.getAbsolutePath() + " (" + fvuFile.length() + " bytes)");
        }
        if (errFile.exists()) {
            System.out.println("\n=========================================================");
            System.out.println("      TDS/TCS DATA VALIDATION ERROR REPORT (.ERR)        ");
            System.out.println("=========================================================");
            try (BufferedReader br = new BufferedReader(new FileReader(errFile))) {
                String line;
                while ((line = br.readLine()) != null) {
                    System.out.println(line);
                }
            } catch (Exception e) {
                System.err.println("Error reading .err file: " + e.getMessage());
            }
            System.out.println("=========================================================\n");
        }
    }
}
