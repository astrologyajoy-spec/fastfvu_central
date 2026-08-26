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
        System.out.println("   NSDL FVU Pure Desktop GUI Automation Runner (Xvfb)   ");
        System.out.println("=========================================================");

        if (args.length < 3) {
            System.err.println("Usage: java FVUGUIAutomator <txtPath> <errPath> <csiPath>");
            System.exit(1);
        }

        final String txtPath = args[0];
        final String errPath = args[1];
        final String csiPath = args[2];

        System.out.println("[GUI Automator] Input TXT Path: " + txtPath);
        System.out.println("[GUI Automator] Error/Output Log Path: " + errPath);
        System.out.println("[GUI Automator] CSI Challan Path: " + csiPath);

        final String expectedFvu = errPath.replaceAll("\\.err$", ".fvu");

        try {
            // Step 1: Launch NSDL FVU Desktop GUI in a background thread
            System.out.println("[GUI Automator] Launching NSDL Desktop GUI (com.tin.FVU.FVU.main(new String[0]))...");
            new Thread(() -> {
                try {
                    com.tin.FVU.FVU.main(new String[0]);
                } catch (Throwable t) {
                    System.err.println("[GUI Automator] Note on NSDL GUI launch: " + t.getMessage());
                }
            }).start();

            // Step 2: Poll for active/displayable Desktop Window with generous timeout (20s)
            System.out.println("[GUI Automator] Waiting for GUI Window to render...");
            Window mainWindow = null;
            for (int i = 0; i < 100; i++) {
                Thread.sleep(200);
                mainWindow = findActiveWindow();
                if (mainWindow != null) break;
            }

            if (mainWindow != null) {
                final Window activeWindow = mainWindow;
                String title = (activeWindow instanceof Frame) ? ((Frame) activeWindow).getTitle() : activeWindow.getName();
                System.out.println("[GUI Automator] Active Window Found: " + title + " (" + activeWindow.getClass().getName() + ")");

                // Step 3: Populate text input fields on GUI
                final List<Component> textComponents = new ArrayList<>();
                findTextComponents(activeWindow, textComponents);
                System.out.println("[GUI Automator] Detected " + textComponents.size() + " text input fields in GUI.");

                SwingUtilities.invokeAndWait(() -> {
                    if (textComponents.size() >= 3) {
                        setTextValue(textComponents.get(0), txtPath);
                        setTextValue(textComponents.get(1), errPath);
                        setTextValue(textComponents.get(2), csiPath.equals("0") ? "" : csiPath);
                        System.out.println("[GUI Automator] Populated 3 text fields (TXT Path, ERR Output Path, CSI Path).");
                    } else if (textComponents.size() >= 2) {
                        setTextValue(textComponents.get(0), txtPath);
                        setTextValue(textComponents.get(1), errPath);
                        System.out.println("[GUI Automator] Populated 2 text fields (TXT Path, ERR Output Path).");
                    } else if (textComponents.size() >= 1) {
                        setTextValue(textComponents.get(0), txtPath);
                        System.out.println("[GUI Automator] Populated 1 text field (TXT Path).");
                    }
                });

                // Step 4: Locate and click "Validate" button on GUI
                final List<Component> buttonComponents = new ArrayList<>();
                findButtonComponents(activeWindow, buttonComponents);
                System.out.println("[GUI Automator] Detected " + buttonComponents.size() + " buttons in GUI.");

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
                        System.out.println("[GUI Automator] Triggering click on 'Validate' button...");
                        clickButton(targetBtn);
                    });
                } else if (!buttonComponents.isEmpty()) {
                    final Component fallbackBtn = buttonComponents.get(0);
                    System.out.println("[GUI Automator] Triggering primary button: " + getButtonText(fallbackBtn));
                    SwingUtilities.invokeAndWait(() -> clickButton(fallbackBtn));
                }
            } else {
                System.out.println("[GUI Automator] NOTICE: No GUI Window rendered within 20s. Proceeding to direct validation engine...");
            }

            // Step 5: Poll for output files (.fvu or .err) and dismiss popup dialogs
            System.out.println("[GUI Automator] Monitoring validation execution...");
            boolean completed = false;

            for (int sec = 0; sec < 40; sec++) {
                Thread.sleep(500);

                if (mainWindow != null) {
                    dismissDialogs(mainWindow);
                }

                if (new File(expectedFvu).exists() || new File(errPath).exists()) {
                    System.out.println("[GUI Automator] SUCCESS: Validation output created in " + (sec * 0.5) + " seconds.");
                    completed = true;
                    break;
                }

                // If output not created after 5 seconds, invoke in-memory engine trigger as safety backup
                if (sec == 10 && !new File(expectedFvu).exists() && !new File(errPath).exists()) {
                    System.out.println("[GUI Automator] Secondary trigger: Invoking in-memory validation engine...");
                    runInMemoryEngine(txtPath, errPath, expectedFvu, csiPath);
                }
            }

            if (!completed && !new File(expectedFvu).exists() && !new File(errPath).exists()) {
                System.out.println("[GUI Automator] Final Trigger: Executing direct in-memory validator...");
                runInMemoryEngine(txtPath, errPath, expectedFvu, csiPath);
            }

            // Step 6: Print validation error log (.err) if produced
            checkAndReportOutput(expectedFvu, errPath);

        } catch (Throwable t) {
            System.err.println("[GUI Automator] Fatal Exception: " + t.getMessage());
            t.printStackTrace();
            try {
                runInMemoryEngine(txtPath, errPath, expectedFvu, csiPath);
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
            try {
                f.setVisible(true);
                f.toFront();
                return f;
            } catch (Throwable ignored) {}
        }
        for (Window w : windows) {
            try {
                w.setVisible(true);
                w.toFront();
                return w;
            } catch (Throwable ignored) {}
        }
        return null;
    }

    private static void dismissDialogs(Window mainWindow) {
        Window[] windows = Window.getWindows();
        for (Window w : windows) {
            if (w != mainWindow && w.isVisible() && (w instanceof Dialog || w instanceof JDialog)) {
                System.out.println("[GUI Automator] Dismissing Popup Dialog: " + w.getClass().getName());
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

    private static void runInMemoryEngine(String txtPath, String errPath, String fvuPath, String csiPath) {
        try {
            System.out.println("[GUI Automator] Executing com.tin.FVU.FVU in-memory validation signature...");
            com.tin.FVU.FVU.main(new String[]{
                txtPath, errPath, fvuPath, "0", csiPath.equals("0") ? "0" : csiPath, "0", "8.5"
            });
        } catch (Throwable t) {
            System.err.println("[GUI Automator] In-memory engine note: " + t.getMessage());
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
