import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

public class MockFVU {
    public static void main(String[] args) {
        if (args.length < 3) {
            System.err.println("Usage: java -jar eTDS_FVU.jar <input> <error> <fvu>");
            System.exit(1);
        }
        
        String inputFile = args[0];
        String errorFile = args[1];
        String fvuFile = args[2];
        
        try {
            String content = new String(Files.readAllBytes(Paths.get(inputFile)));
            
            if (content.contains("ERROR")) {
                // Simulate an error
                try (FileWriter writer = new FileWriter(errorFile)) {
                    writer.write("T-FVU-1001^Invalid TAN format\n");
                    writer.write("T-FVU-1002^Missing challan details\n");
                }
                System.out.println("Validation failed.");
                System.exit(1);
            } else {
                // Simulate success
                try (FileWriter writer = new FileWriter(fvuFile)) {
                    writer.write("FVU File Generated Successfully\n");
                    writer.write("Version: 8.5\n");
                    writer.write("Input Length: " + content.length() + "\n");
                }
                System.out.println("File validated successfully at path: " + fvuFile);
            }
        } catch (IOException e) {
            System.err.println("I/O Error: " + e.getMessage());
            System.exit(1);
        }
    }
}
