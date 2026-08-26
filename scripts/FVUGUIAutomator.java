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
            // Step 1: Launch NSDL Desktop GUI in a background daemon thread with ZERO arguments
            System.out.println("[GUI Automator] Launching NSDL Desktop GUI Window (com.tin.FVU.FVU.main(new String[0]))...");
            Thread guiLauncher = new Thread(() -> {
                try {
                    com.tin.FVU.FVU.main(new String[0]);
                } catch (Throwable t) {
                    System.err.println("[GUI Automator] Note on Desktop GUI launch: " + t.getMessage());
                }
            });
            guiLauncher.setDaemon(true);
            guiLauncher.start();

            // Step 2: Poll continuously on background thread for GUI Window & Component instantiation
            System.out.println("[GUI Automator] Polling for Desktop GUI Window & Text Field Components...");
            Window targetWindow = null;
            List<Component> textComponents = new ArrayList<>();
            List<Component> buttonComponents = new ArrayList<>();

            for (int i = 0; i < 150; i++) { // Poll up to 30 seconds
                Thread.sleep(200);

                // Auto-dismiss any startup modal dialogs (welcome popups, alerts, disclaimers)
                dismissDialogs(null);

                Window[] windows = Window.getWindows();
                Frame[] frames = Frame.getFrames();
                List<Window> candidateWindows = new ArrayList<>();
                for (Window w : windows) candidateWindows.add(w);
                for (Frame f : frames) {
                    if (!candidateWindows.contains(f)) candidateWindows.add(f);
                }

                for (Window candidate : candidateWindows) {
                    if (candidate instanceof Dialog || candidate instanceof JDialog) {
                        continue; // Skip dialogs for main text field discovery
                    }

                    List<Component> tc = new ArrayList<>();
                    List<Component> bc = new ArrayList<>();
                    findTextComponents(candidate, tc);
                    findButtonComponents(candidate, bc);

                    if (!tc.isEmpty()) {
                        targetWindow = candidate;
                        textComponents = tc;
                        buttonComponents = bc;
                        break;
                    }
                }

                if (targetWindow != null && !textComponents.isEmpty()) {
                    break;
                }

                // Force visibility on frames if rendering is delayed in XVFB
                if (i >= 10 && i % 10 == 0) {
                    for (Frame f : frames) {
                        try {
                            f.setVisible(true);
                            f.toFront();
                        } catch (Throwable ignored) {}
                    }
                }
            }

            if (targetWindow == null || textComponents.isEmpty()) {
                System.err.println("[GUI Automator] ERROR: Desktop Window or text fields failed to render within 30 seconds.");
                System.exit(1);
                return;
            }

            final Window activeWindow = targetWindow;
            String title = (activeWindow instanceof Frame) ? ((Frame) activeWindow).getTitle() : activeWindow.getName();
            System.out.println("[GUI Automator] Active Window Found: " + title + " (" + activeWindow.getClass().getName() + ")");
            System.out.println("[GUI Automator] Detected " + textComponents.size() + " text field inputs in GUI Window.");
            System.out.println("[GUI Automator] Detected " + buttonComponents.size() + " buttons in GUI Window.");

            // Step 3: Populate GUI Text Fields on Swing Event Dispatch Thread (EDT)
            final List<Component> finalFields = textComponents;
            SwingUtilities.invokeAndWait(() -> {
                try {
                    activeWindow.setVisible(true);
                    if (activeWindow instanceof Frame) {
                        ((Frame) activeWindow).toFront();
                    }
                } catch (Throwable ignored) {}

                if (finalFields.size() >= 3) {
                    setTextValue(finalFields.get(0), txtPath);
                    setTextValue(finalFields.get(1), errPath);
                    setTextValue(finalFields.get(2), csiPath.equals("0") ? "" : csiPath);
                    System.out.println("[GUI Automator] Populated 3 text fields (TXT Path, ERR Output Path, CSI Path).");
                } else if (finalFields.size() >= 2) {
                    setTextValue(finalFields.get(0), txtPath);
                    setTextValue(finalFields.get(1), errPath);
                    System.out.println("[GUI Automator] Populated 2 text fields (TXT Path, ERR Output Path).");
                } else if (finalFields.size() >= 1) {
                    setTextValue(finalFields.get(0), txtPath);
                    System.out.println("[GUI Automator] Populated 1 text field (TXT Path).");
                }
            });

            Thread.sleep(300); // Allow EDT event propagation

            // Step 4: Locate and click "Validate" action button on Swing EDT
            List<Component> currentButtons = new ArrayList<>();
            findButtonComponents(activeWindow, currentButtons);
            if (currentButtons.isEmpty()) {
                currentButtons = buttonComponents;
            }

            Component validateBtn = null;
            for (Component btn : currentButtons) {
                String label = getButtonText(btn).toLowerCase();
                if (label.contains("validate") || label.contains("ok") || label.contains("start")) {
                    validateBtn = btn;
                    break;
                }
            }

            if (validateBtn == null) {
                for (Component btn : currentButtons) {
                    String label = getButtonText(btn).toLowerCase();
                    if (!label.contains("browse") && !label.contains("exit") && !label.contains("clear") && !label.contains("cancel")) {
                        validateBtn = btn;
                        break;
                    }
                }
            }

            if (validateBtn == null && !currentButtons.isEmpty()) {
                validateBtn = currentButtons.get(0);
            }

            if (validateBtn != null) {
                final Component targetBtn = validateBtn;
                System.out.println("[GUI Automator] Found Action Button: '" + getButtonText(targetBtn) + "'");
                SwingUtilities.invokeAndWait(() -> {
                    System.out.println("[GUI Automator] Triggering click on Action button...");
                    clickButton(targetBtn);
                });
            } else {
                System.err.println("[GUI Automator] WARNING: No actionable button found on Desktop Window.");
            }

            // Step 5: Monitor validation execution & auto-dismiss modal popup dialogs
            System.out.println("[GUI Automator] Monitoring validation execution...");
            boolean completed = false;

            for (int sec = 0; sec < 120; sec++) {
                Thread.sleep(500);

                dismissDialogs(activeWindow);

                if (new File(expectedFvu).exists() || new File(errPath).exists()) {
                    System.out.println("[GUI Automator] SUCCESS: Output file created in " + (sec * 0.5) + " seconds.");
                    completed = true;
                    break;
                }

                // Safety re-trigger if initial click was lost or delayed
                if (sec == 10 && validateBtn != null && !new File(expectedFvu).exists() && !new File(errPath).exists()) {
                    final Component retryBtn = validateBtn;
                    System.out.println("[GUI Automator] Re-triggering Action button click on Swing EDT...");
                    SwingUtilities.invokeLater(() -> clickButton(retryBtn));
                }
            }

            if (!completed) {
                System.out.println("[GUI Automator] TIMEOUT: Output file (.fvu or .err) was not generated after 60 seconds.");
            }

            // Step 6: Print validation output report if generated
            checkAndReportOutput(expectedFvu, errPath);

        } catch (Throwable t) {
            System.err.println("[GUI Automator] Fatal Exception during GUI automation: " + t.getMessage());
            t.printStackTrace();
        } finally {
            System.exit(0);
        }
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

    private static void checkAndReportOutput(String fvuPath, String errPath) {
        File fvuFile = new File(fvuPath);
        File errFile = new File(errPath);

        if (fvuFile.exists()) {
            System.out.println("\n[GUI Automator] .fvu File Successfully Created: " + fvuFile.getAbsolutePath() + " (" + fvuFile.length() + " bytes)");
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
        if (container == null) return;
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
        if (container == null) return;
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
            JTextComponent jtc = (JTextComponent) c;
            jtc.setText(text);
            try {
                jtc.setCaretPosition(text.length());
            } catch (Throwable ignored) {}
        } else if (c instanceof TextComponent) {
            TextComponent tc = (TextComponent) c;
            tc.setText(text);
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
            AbstractButton ab = (AbstractButton) c;
            try {
                ab.requestFocusInWindow();
            } catch (Throwable ignored) {}
            ab.doClick();
        } else if (c instanceof Button) {
            Button b = (Button) c;
            for (ActionListener al : b.getActionListeners()) {
                al.actionPerformed(new ActionEvent(b, ActionEvent.ACTION_PERFORMED, b.getActionCommand()));
            }
        }
    }
}
