import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class FVUGUIAutomator {
    public static void main(String[] args) {
        System.out.println("=== Starting NSDL FVU Desktop GUI Automation Wrapper ===");
        if (args.length < 3) {
            System.err.println("Usage: java FVUGUIAutomator <txtPath> <errPath> <csiPath> [fvuVersion]");
            System.exit(1);
        }

        final String txtPath = args[0];
        final String errPath = args[1];
        final String csiPath = args[2];
        final String versionStr = (args.length >= 4) ? args[3] : "8.5";

        System.out.println("Input TXT: " + txtPath);
        System.out.println("Error Path: " + errPath);
        System.out.println("CSI Path: " + csiPath);
        System.out.println("RPU Version: " + versionStr);

        try {
            // 1. Launch com.tin.FVU.FVU on Swing Event Dispatch Thread
            SwingUtilities.invokeLater(() -> {
                try {
                    System.out.println("Launching com.tin.FVU.FVU main GUI...");
                    com.tin.FVU.FVU.main(new String[0]);
                } catch (Throwable t) {
                    System.err.println("Error launching com.tin.FVU.FVU GUI: " + t.getMessage());
                    t.printStackTrace();
                }
            });

            // 2. Poll for active JFrame window
            JFrame mainFrame = null;
            System.out.println("Waiting for GUI Window (JFrame) to load...");
            for (int i = 0; i < 40; i++) {
                Thread.sleep(250);
                Window[] windows = Window.getWindows();
                for (Window w : windows) {
                    if (w instanceof JFrame && w.isVisible()) {
                        mainFrame = (JFrame) w;
                        break;
                    }
                }
                if (mainFrame != null) break;
            }

            if (mainFrame == null) {
                System.err.println("[WARN] JFrame not found after 10s waiting. Checking fallback CLI execution...");
                // Attempt CLI fallback with 7 parameters if GUI frame did not open
                com.tin.FVU.FVU.main(new String[]{
                    txtPath, errPath, errPath.replaceAll("\\.err$", ".fvu"), "0", csiPath, "0", versionStr
                });
                return;
            }

            System.out.println("Found Active Desktop Window: " + mainFrame.getTitle());

            // 3. Traversal of components inside JFrame to populate text fields
            final List<JTextField> fields = new ArrayList<>();
            findComponents(mainFrame, JTextField.class, fields);

            System.out.println("Detected " + fields.size() + " text field inputs in GUI window.");

            SwingUtilities.invokeAndWait(() -> {
                if (fields.size() >= 3) {
                    fields.get(0).setText(txtPath);
                    fields.get(1).setText(errPath);
                    fields.get(2).setText(csiPath.equals("0") ? "" : csiPath);
                    System.out.println("[GUI] Auto-filled 3 input fields (TXT, ERR, CSI).");
                } else if (fields.size() >= 2) {
                    fields.get(0).setText(txtPath);
                    fields.get(1).setText(errPath);
                    System.out.println("[GUI] Auto-filled 2 input fields (TXT, ERR).");
                } else if (fields.size() >= 1) {
                    fields.get(0).setText(txtPath);
                    System.out.println("[GUI] Auto-filled 1 input field (TXT).");
                }
            });

            // 4. Locate and trigger "Validate" Button
            final List<JButton> buttons = new ArrayList<>();
            findComponents(mainFrame, JButton.class, buttons);

            JButton validateButton = null;
            for (JButton btn : buttons) {
                String btnText = btn.getText();
                if (btnText != null && (btnText.equalsIgnoreCase("Validate") || btnText.toLowerCase().contains("validate"))) {
                    validateButton = btn;
                    break;
                }
            }

            if (validateButton != null) {
                final JButton targetBtn = validateButton;
                System.out.println("Found 'Validate' Button in GUI: " + targetBtn.getText());
                SwingUtilities.invokeAndWait(() -> {
                    System.out.println("[GUI] Triggering programmatic click on 'Validate' button...");
                    targetBtn.doClick();
                });
            } else {
                final JFrame targetFrame = mainFrame;
                System.err.println("[WARN] 'Validate' button not found by label, triggering Enter key / default button...");
                SwingUtilities.invokeAndWait(() -> {
                    JButton defaultBtn = targetFrame.getRootPane().getDefaultButton();
                    if (defaultBtn != null) {
                        defaultBtn.doClick();
                    }
                });
            }

            // 5. Wait for validation processing & output file creation
            String fvuExpected = errPath.replaceAll("\\.err$", ".fvu");
            System.out.println("Monitoring for generated output files: " + fvuExpected + " or " + errPath);

            boolean completed = false;
            for (int sec = 0; sec < 30; sec++) {
                Thread.sleep(1000);
                if (new File(fvuExpected).exists() || new File(errPath).exists()) {
                    System.out.println("Validation complete! Created file in " + sec + " seconds.");
                    completed = true;
                    break;
                }
            }

            if (!completed) {
                System.out.println("Validation timeout reached (30s). Closing desktop session...");
            }

        } catch (Throwable t) {
            System.err.println("Fatal exception during Desktop GUI Automation: " + t.getMessage());
            t.printStackTrace();
        } finally {
            System.exit(0);
        }
    }

    private static <T extends Component> void findComponents(Container container, Class<T> clazz, List<T> result) {
        for (Component c : container.getComponents()) {
            if (clazz.isInstance(c)) {
                result.add(clazz.cast(c));
            }
            if (c instanceof Container) {
                findComponents((Container) c, clazz, result);
            }
        }
    }
}
