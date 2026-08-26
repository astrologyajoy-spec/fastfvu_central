import javax.swing.*;
import javax.swing.text.JTextComponent;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.KeyEvent;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

public class FVUGUIAutomator {
    public static void main(String[] args) {
        System.out.println("=========================================================");
        System.out.println("     NSDL FVU Desktop GUI Automation Engine (Xvfb)      ");
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
            // Step 1: Launch NSDL FVU Desktop GUI on Swing EDT
            System.out.println("[GUI Automator] Launching NSDL FVU Desktop Window (com.tin.FVU.FVU)...");
            SwingUtilities.invokeLater(() -> {
                try {
                    com.tin.FVU.FVU.main(new String[0]);
                } catch (Throwable t) {
                    System.err.println("[GUI Automator] Note on com.tin.FVU.FVU.main(new String[0]): " + t.getMessage());
                }
            });

            // Step 2: Poll for visible Window / Frame
            System.out.println("[GUI Automator] Waiting for GUI window to render...");
            Window mainWindow = null;
            for (int i = 0; i < 30; i++) {
                Thread.sleep(200);
                mainWindow = findActiveWindow();
                if (mainWindow != null) break;
            }

            // Fallback launch if no window appeared yet
            if (mainWindow == null) {
                System.out.println("[GUI Automator] Initial window poll empty. Re-invoking GUI main on EDT...");
                SwingUtilities.invokeAndWait(() -> {
                    try {
                        com.tin.FVU.FVU.main(new String[]{txtPath, errPath, expectedFvu, "0", csiPath, "0", versionStr});
                    } catch (Throwable t) {
                        System.err.println("[GUI Automator] Secondary launch note: " + t.getMessage());
                    }
                });
                for (int i = 0; i < 20; i++) {
                    Thread.sleep(200);
                    mainWindow = findActiveWindow();
                    if (mainWindow != null) break;
                }
            }

            if (mainWindow == null) {
                System.out.println("[GUI Automator] NOTICE: No Swing Window detected. Running internal fallback validator...");
                runInternalFallback(txtPath, errPath, expectedFvu, csiPath, versionStr);
                checkAndReportOutput(expectedFvu, errPath);
                System.exit(0);
                return;
            }

            final Window activeWindow = mainWindow;
            String title = (activeWindow instanceof Frame) ? ((Frame) activeWindow).getTitle() : activeWindow.getName();
            System.out.println("[GUI Automator] Active GUI Window Found: " + title + " (" + activeWindow.getClass().getName() + ")");

            // Step 3: Find & populate text components
            final List<Component> textComponents = new ArrayList<>();
            findTextComponents(activeWindow, textComponents);
            System.out.println("[GUI Automator] Found " + textComponents.size() + " text field inputs in GUI window.");

            SwingUtilities.invokeAndWait(() -> {
                if (textComponents.size() >= 3) {
                    setTextValue(textComponents.get(0), txtPath);
                    setTextValue(textComponents.get(1), errPath);
                    setTextValue(textComponents.get(2), csiPath.equals("0") ? "" : csiPath);
                    System.out.println("[GUI Automator] Populated 3 GUI text fields (TXT, Output/ERR, CSI).");
                } else if (textComponents.size() >= 2) {
                    setTextValue(textComponents.get(0), txtPath);
                    setTextValue(textComponents.get(1), errPath);
                    System.out.println("[GUI Automator] Populated 2 GUI text fields (TXT, Output/ERR).");
                } else if (textComponents.size() >= 1) {
                    setTextValue(textComponents.get(0), txtPath);
                    System.out.println("[GUI Automator] Populated 1 GUI text field (TXT).");
                }
            });

            // Step 4: Dropdown / Combo version selection
            final List<Component> comboComponents = new ArrayList<>();
            findComboComponents(activeWindow, comboComponents);
            if (!comboComponents.isEmpty()) {
                SwingUtilities.invokeAndWait(() -> {
                    for (Component combo : comboComponents) {
                        selectComboVersion(combo, versionStr);
                    }
                });
            }

            // Step 5: Locate and trigger "Validate" button
            final List<Component> buttonComponents = new ArrayList<>();
            findButtonComponents(activeWindow, buttonComponents);
            System.out.println("[GUI Automator] Found " + buttonComponents.size() + " buttons in GUI window.");

            Component validateBtn = null;
            for (Component btn : buttonComponents) {
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
                    System.out.println("[GUI Automator] Pressing 'Validate' button on Desktop GUI...");
                    clickButton(targetBtn);
                });
            } else if (!buttonComponents.isEmpty()) {
                final Component fallbackBtn = buttonComponents.get(0);
                System.out.println("[GUI Automator] Triggering primary button: " + getButtonText(fallbackBtn));
                SwingUtilities.invokeAndWait(() -> clickButton(fallbackBtn));
            } else if (activeWindow instanceof JFrame) {
                final JFrame jf = (JFrame) activeWindow;
                SwingUtilities.invokeAndWait(() -> {
                    JButton defBtn = jf.getRootPane().getDefaultButton();
                    if (defBtn != null) {
                        System.out.println("[GUI Automator] Triggering RootPane Default Button...");
                        defBtn.doClick();
                    }
                });
            }

            // Step 6: Monitor validation progress and auto-dismiss modal popup dialogs
            System.out.println("[GUI Automator] Monitoring validation execution...");
            boolean finished = false;

            for (int sec = 0; sec < 40; sec++) {
                Thread.sleep(500);

                // Auto-dismiss popups (alerts, dialogs, completion popups)
                dismissDialogs(activeWindow);

                if (new File(expectedFvu).exists() || new File(errPath).exists()) {
                    System.out.println("[GUI Automator] SUCCESS: Validation output generated in " + (sec * 0.5) + " seconds.");
                    finished = true;
                    break;
                }

                // Intermediate trigger if button click was silent (after 5 seconds)
                if (sec == 10 && !new File(expectedFvu).exists() && !new File(errPath).exists()) {
                    System.out.println("[GUI Automator] Intermediate trigger: Re-invoking validator logic on Swing EDT...");
                    runInternalFallback(txtPath, errPath, expectedFvu, csiPath, versionStr);
                }
            }

            if (!finished) {
                if (!new File(expectedFvu).exists() && !new File(errPath).exists()) {
                    System.out.println("[GUI Automator] Final Trigger: Invoking direct validation engine...");
                    runInternalFallback(txtPath, errPath, expectedFvu, csiPath, versionStr);
                }
            }

            // Step 7: Output error report content if .err was produced
            checkAndReportOutput(expectedFvu, errPath);

        } catch (Throwable t) {
            System.err.println("[GUI Automator] Exception during GUI execution: " + t.getMessage());
            t.printStackTrace();
            try {
                runInternalFallback(txtPath, errPath, expectedFvu, csiPath, versionStr);
                checkAndReportOutput(expectedFvu, errPath);
            } catch (Throwable ignored) {}
        } finally {
            System.exit(0);
        }
    }

    private static Window findActiveWindow() {
        Window[] windows = Window.getWindows();
        for (Window w : windows) {
            if (w.isVisible()) return w;
        }
        Frame[] frames = Frame.getFrames();
        for (Frame f : frames) {
            if (f.isVisible()) return f;
            if (f.isDisplayable()) {
                f.setVisible(true);
                return f;
            }
        }
        return null;
    }

    private static void dismissDialogs(Window mainWindow) {
        Window[] windows = Window.getWindows();
        for (Window w : windows) {
            if (w != mainWindow && w.isVisible() && (w instanceof Dialog || w instanceof JDialog)) {
                System.out.println("[GUI Automator] Detected Dialog Popup: " + w.getClass().getName() + ". Dismissing...");
                final Window pop = w;
                SwingUtilities.invokeLater(() -> {
                    try {
                        List<Component> btns = new ArrayList<>();
                        findButtonComponents(pop, btns);
                        for (Component b : btns) {
                            clickButton(b);
                        }
                        pop.setVisible(false);
                        pop.dispose();
                    } catch (Throwable ignored) {}
                });
            }
        }
    }

    private static void runInternalFallback(String txtPath, String errPath, String fvuPath, String csiPath, String versionStr) {
        try {
            System.out.println("[GUI Automator] Executing com.tin.FVU.FVU.main fallback signature...");
            com.tin.FVU.FVU.main(new String[]{
                txtPath, errPath, fvuPath, "0", csiPath.equals("0") ? "0" : csiPath, "0", versionStr
            });
        } catch (Throwable t) {
            System.err.println("[GUI Automator] Internal Engine Note: " + t.getMessage());
        }
    }

    private static void checkAndReportOutput(String fvuPath, String errPath) {
        File fvuFile = new File(fvuPath);
        File errFile = new File(errPath);

        if (fvuFile.exists()) {
            System.out.println("[GUI Automator] .fvu File Successfully Created: " + fvuFile.getAbsolutePath() + " (" + fvuFile.length() + " bytes)");
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
