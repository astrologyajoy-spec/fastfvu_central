import javax.swing.*;
import javax.swing.text.JTextComponent;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

public class FVUGUIAutomator {
    public static void main(String[] args) {
        System.out.println("=========================================================");
        System.out.println("     NSDL FVU Desktop GUI Automation Runner (Xvfb)      ");
        System.out.println("=========================================================");

        if (args.length < 3) {
            System.err.println("Usage: java FVUGUIAutomator <txtPath> <errPath> <csiPath> [fvuVersion]");
            System.exit(1);
        }

        final String txtPath = args[0];
        final String errPath = args[1];
        final String csiPath = args[2];
        final String versionStr = (args.length >= 4) ? args[3] : "8.5";

        System.out.println("[GUI Automator] Input TXT Path: " + txtPath);
        System.out.println("[GUI Automator] Error Log Path: " + errPath);
        System.out.println("[GUI Automator] CSI Challan Path: " + csiPath);
        System.out.println("[GUI Automator] Target Version: " + versionStr);

        final String expectedFvu = errPath.replaceAll("\\.err$", ".fvu");

        try {
            // 1. Launch NSDL FVU Desktop GUI on Swing Event Dispatch Thread
            System.out.println("[GUI Automator] Launching NSDL FVU Desktop GUI (com.tin.FVU.FVU)...");
            SwingUtilities.invokeLater(() -> {
                try {
                    com.tin.FVU.FVU.main(new String[0]);
                } catch (Throwable t) {
                    System.err.println("[GUI Automator] Error starting NSDL GUI: " + t.getMessage());
                    t.printStackTrace();
                }
            });

            // 2. Poll for main visible window
            System.out.println("[GUI Automator] Waiting for GUI window to render...");
            Window mainWindow = null;
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
                System.err.println("[GUI Automator] ERROR: Desktop Window failed to open within 10 seconds.");
                System.exit(1);
            }

            final Window activeWindow = mainWindow;
            String title = (activeWindow instanceof Frame) ? ((Frame) activeWindow).getTitle() : activeWindow.getName();
            System.out.println("[GUI Automator] Found Active Window: " + title + " (" + activeWindow.getClass().getName() + ")");

            // 3. Find and populate text input components
            final List<Component> textComponents = new ArrayList<>();
            findTextComponents(activeWindow, textComponents);
            System.out.println("[GUI Automator] Detected " + textComponents.size() + " text field inputs in GUI.");

            SwingUtilities.invokeAndWait(() -> {
                if (textComponents.size() >= 3) {
                    setTextValue(textComponents.get(0), txtPath);
                    setTextValue(textComponents.get(1), errPath);
                    setTextValue(textComponents.get(2), csiPath.equals("0") ? "" : csiPath);
                    System.out.println("[GUI Automator] Populated 3 text fields (TXT, Output Path, CSI).");
                } else if (textComponents.size() >= 2) {
                    setTextValue(textComponents.get(0), txtPath);
                    setTextValue(textComponents.get(1), errPath);
                    System.out.println("[GUI Automator] Populated 2 text fields (TXT, Output Path).");
                } else if (textComponents.size() >= 1) {
                    setTextValue(textComponents.get(0), txtPath);
                    System.out.println("[GUI Automator] Populated 1 text field (TXT).");
                }
            });

            // 4. Check for version ComboBoxes or dropdowns if present
            final List<Component> comboComponents = new ArrayList<>();
            findComboComponents(activeWindow, comboComponents);
            if (!comboComponents.isEmpty()) {
                SwingUtilities.invokeAndWait(() -> {
                    for (Component combo : comboComponents) {
                        selectComboVersion(combo, versionStr);
                    }
                });
            }

            // 5. Find and click "Validate" button
            final List<Component> buttonComponents = new ArrayList<>();
            findButtonComponents(activeWindow, buttonComponents);
            System.out.println("[GUI Automator] Detected " + buttonComponents.size() + " buttons in GUI.");

            Component targetValidateBtn = null;
            for (Component btn : buttonComponents) {
                String label = getButtonText(btn);
                if (label != null && label.toLowerCase().contains("validate")) {
                    targetValidateBtn = btn;
                    break;
                }
            }

            if (targetValidateBtn != null) {
                final Component finalBtn = targetValidateBtn;
                System.out.println("[GUI Automator] Found 'Validate' Button: " + getButtonText(finalBtn));
                SwingUtilities.invokeAndWait(() -> {
                    System.out.println("[GUI Automator] Triggering click on 'Validate' button...");
                    clickButton(finalBtn);
                });
            } else if (!buttonComponents.isEmpty()) {
                final Component fallbackBtn = buttonComponents.get(0);
                System.out.println("[GUI Automator] Triggering primary button: " + getButtonText(fallbackBtn));
                SwingUtilities.invokeAndWait(() -> clickButton(fallbackBtn));
            }

            // 6. Monitor progress, handle popup dialogs, wait for .fvu or .err
            System.out.println("[GUI Automator] Monitoring validation processing...");
            boolean completed = false;

            for (int sec = 0; sec < 45; sec++) {
                Thread.sleep(1000);

                // Auto-dismiss dialog popups (alerts/messages)
                Window[] allWindows = Window.getWindows();
                for (Window w : allWindows) {
                    if (w != activeWindow && w.isVisible() && (w instanceof Dialog || w instanceof JDialog)) {
                        System.out.println("[GUI Automator] Dismissing Popup Dialog: " + w.getClass().getName());
                        final Window pop = w;
                        SwingUtilities.invokeLater(() -> {
                            pop.setVisible(false);
                            pop.dispose();
                        });
                    }
                }

                if (new File(expectedFvu).exists() || new File(errPath).exists()) {
                    System.out.println("[GUI Automator] SUCCESS: Validation completed in " + sec + " seconds.");
                    completed = true;
                    break;
                }
            }

            if (!completed) {
                System.out.println("[GUI Automator] WARNING: Timed out waiting for output file generation (45s).");
            }

            // 7. Output .err file content to stdout if generated
            File errFile = new File(errPath);
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

        } catch (Throwable t) {
            System.err.println("[GUI Automator] Fatal Error during execution: " + t.getMessage());
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

    private static void findComboComponents(Container container, List<Component> result) {
        for (Component c : container.getComponents()) {
            if (c instanceof JComboBox || c instanceof Choice) {
                result.add(c);
            }
            if (c instanceof Container) {
                findComboComponents((Container) c, result);
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

    private static void selectComboVersion(Component c, String versionStr) {
        if (c instanceof JComboBox) {
            JComboBox<?> box = (JComboBox<?>) c;
            for (int i = 0; i < box.getItemCount(); i++) {
                Object item = box.getItemAt(i);
                if (item != null && item.toString().contains(versionStr)) {
                    box.setSelectedIndex(i);
                    System.out.println("[GUI Automator] Selected JComboBox Version: " + item);
                    return;
                }
            }
        } else if (c instanceof Choice) {
            Choice choice = (Choice) c;
            for (int i = 0; i < choice.getItemCount(); i++) {
                String item = choice.getItem(i);
                if (item != null && item.contains(versionStr)) {
                    choice.select(i);
                    System.out.println("[GUI Automator] Selected Choice Version: " + item);
                    return;
                }
            }
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
