import javax.swing.*;
import javax.swing.text.JTextComponent;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class FVUGUIAutomator {
    public static void main(String[] args) {
        System.out.println("=== NSDL FVU Desktop GUI Automation Engine ===");
        if (args.length < 3) {
            System.err.println("Usage: java FVUGUIAutomator <txtPath> <errPath> <csiPath> [fvuVersion]");
            System.exit(1);
        }

        final String txtPath = args[0];
        final String errPath = args[1];
        final String csiPath = args[2];
        final String versionStr = (args.length >= 4) ? args[3] : "8.5";

        System.out.println("[GUI Automator] Input TXT: " + txtPath);
        System.out.println("[GUI Automator] Error Log Path: " + errPath);
        System.out.println("[GUI Automator] CSI Challan Path: " + csiPath);
        System.out.println("[GUI Automator] Version Parameter: " + versionStr);

        try {
            // 1. Launch the NSDL FVU main GUI Window
            SwingUtilities.invokeLater(() -> {
                try {
                    System.out.println("[GUI Automator] Opening NSDL FVU Desktop Window (com.tin.FVU.FVU)...");
                    com.tin.FVU.FVU.main(new String[0]);
                } catch (Throwable t) {
                    System.err.println("[GUI Automator] Error opening NSDL GUI window: " + t.getMessage());
                    t.printStackTrace();
                }
            });

            // 2. Poll for active Window (Frame / JFrame / Dialog)
            Window mainWindow = null;
            System.out.println("[GUI Automator] Waiting for Desktop Window to appear on screen...");
            for (int i = 0; i < 40; i++) {
                Thread.sleep(250);
                Window[] windows = Window.getWindows();
                for (Window w : windows) {
                    if (w.isVisible()) {
                        mainWindow = w;
                        break;
                    }
                }
                if (mainWindow != null) break;
            }

            if (mainWindow == null) {
                System.err.println("[GUI Automator] [WARN] Desktop GUI Window did not appear in time. Exiting without CLI fallback...");
                return;
            }

            String windowTitle = (mainWindow instanceof Frame) ? ((Frame) mainWindow).getTitle() : mainWindow.getName();
            System.out.println("[GUI Automator] Active Window Found: " + windowTitle + " (" + mainWindow.getClass().getName() + ")");

            final Window targetWindow = mainWindow;

            // 3. Find all text field inputs (AWT & Swing)
            final List<Component> textFields = new ArrayList<>();
            findTextComponents(targetWindow, textFields);
            System.out.println("[GUI Automator] Found " + textFields.size() + " text field inputs in GUI window.");

            SwingUtilities.invokeAndWait(() -> {
                if (textFields.size() >= 3) {
                    setTextValue(textFields.get(0), txtPath);
                    setTextValue(textFields.get(1), errPath);
                    setTextValue(textFields.get(2), csiPath.equals("0") ? "" : csiPath);
                    System.out.println("[GUI Automator] Populated 3 GUI Text Fields: [0]=TXT, [1]=ERR, [2]=CSI");
                } else if (textFields.size() >= 2) {
                    setTextValue(textFields.get(0), txtPath);
                    setTextValue(textFields.get(1), errPath);
                    System.out.println("[GUI Automator] Populated 2 GUI Text Fields: [0]=TXT, [1]=ERR");
                } else if (textFields.size() >= 1) {
                    setTextValue(textFields.get(0), txtPath);
                    System.out.println("[GUI Automator] Populated 1 GUI Text Field: [0]=TXT");
                }
            });

            // 4. Locate "Validate" Button (AWT & Swing)
            final List<Component> buttons = new ArrayList<>();
            findButtonComponents(targetWindow, buttons);
            System.out.println("[GUI Automator] Found " + buttons.size() + " buttons in GUI window.");

            Component validateBtn = null;
            for (Component btn : buttons) {
                String label = getButtonText(btn);
                if (label != null && label.toLowerCase().contains("validate")) {
                    validateBtn = btn;
                    break;
                }
            }

            if (validateBtn != null) {
                final Component targetBtn = validateBtn;
                System.out.println("[GUI Automator] Found 'Validate' Button: " + getButtonText(targetBtn));
                SwingUtilities.invokeAndWait(() -> {
                    System.out.println("[GUI Automator] Pressing 'Validate' Button on Desktop GUI Window...");
                    clickButton(targetBtn);
                });
            } else if (!buttons.isEmpty()) {
                final Component fallbackBtn = buttons.get(0);
                System.out.println("[GUI Automator] 'Validate' text not matched directly. Triggering primary button: " + getButtonText(fallbackBtn));
                SwingUtilities.invokeAndWait(() -> {
                    clickButton(fallbackBtn);
                });
            } else if (targetWindow instanceof JFrame) {
                final JFrame jf = (JFrame) targetWindow;
                SwingUtilities.invokeAndWait(() -> {
                    JButton defBtn = jf.getRootPane().getDefaultButton();
                    if (defBtn != null) {
                        System.out.println("[GUI Automator] Triggering RootPane Default Button...");
                        defBtn.doClick();
                    }
                });
            }

            // 5. Monitor validation progress & popup dialogs
            String expectedFvu = errPath.replaceAll("\\.err$", ".fvu");
            System.out.println("[GUI Automator] Monitoring for output files: " + expectedFvu + " or " + errPath);

            boolean finished = false;
            for (int sec = 0; sec < 35; sec++) {
                Thread.sleep(1000);

                // Auto-dismiss any success/error alert dialogs that pop up
                Window[] currentWindows = Window.getWindows();
                for (Window w : currentWindows) {
                    if (w != targetWindow && w.isVisible() && (w instanceof Dialog || w instanceof JDialog)) {
                        System.out.println("[GUI Automator] Detected Popup Dialog: " + w.getClass().getName() + ". Dismissing...");
                        SwingUtilities.invokeLater(() -> {
                            w.setVisible(false);
                            w.dispose();
                        });
                    }
                }

                if (new File(expectedFvu).exists() || new File(errPath).exists()) {
                    System.out.println("[GUI Automator] SUCCESS: Validation output generated in " + sec + " seconds.");
                    finished = true;
                    break;
                }
            }

            if (!finished) {
                System.out.println("[GUI Automator] Timed out waiting for file generation (35s).");
            }

        } catch (Throwable t) {
            System.err.println("[GUI Automator] Exception: " + t.getMessage());
            t.printStackTrace();
        } finally {
            System.exit(0);
        }
    }

    private static void findTextComponents(Container container, List<Component> result) {
        for (Component c : container.getComponents()) {
            if (c instanceof JTextComponent || c instanceof TextComponent) {
                result.add(c);
            }
            if (c instanceof Container) {
                findTextComponents((Container) c, result);
            }
        }
    }

    private static void findButtonComponents(Container container, List<Component> result) {
        for (Component c : container.getComponents()) {
            if (c instanceof AbstractButton || c instanceof Button) {
                result.add(c);
            }
            if (c instanceof Container) {
                findButtonComponents((Container) c, result);
            }
        }
    }

    private static void setTextValue(Component c, String text) {
        if (c instanceof JTextComponent) {
            ((JTextComponent) c).setText(text);
        } else if (c instanceof TextComponent) {
            ((TextComponent) c).setText(text);
        }
    }

    private static String getButtonText(Component c) {
        if (c instanceof AbstractButton) {
            return ((AbstractButton) c).getText();
        } else if (c instanceof Button) {
            return ((Button) c).getLabel();
        }
        return "";
    }

    private static void clickButton(Component c) {
        if (c instanceof AbstractButton) {
            ((AbstractButton) c).doClick();
        } else if (c instanceof Button) {
            Button b = (Button) c;
            for (ActionListener al : b.getActionListeners()) {
                al.actionPerformed(new ActionEvent(b, ActionEvent.ACTION_PERFORMED, b.getActionCommand()));
            }
        }
    }
}
