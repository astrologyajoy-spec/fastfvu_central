import javax.swing.*;
import java.awt.*;
import java.lang.reflect.Method;

public class FVUGUIAutomator {
    private static volatile boolean pathsFilled = false;

    public static void main(String[] args) {
        if (args.length < 3) {
            System.out.println("[GUI Automator Error] Insufficient arguments provided.");
            return;
        }

        final String txtPath = args[0];
        final String errPath = args[1];
        final String csiPath = args[2];

        System.out.println("=========================================================");
        System.out.println(" NSDL FVU Pure Desktop GUI Automation Runner (Optimized) ");
        System.out.println("=========================================================");
        System.out.println("[GUI Automator] Input TXT Path: " + txtPath);
        System.out.println("[GUI Automator] Error/Output Log Path: " + errPath);
        System.out.println("[GUI Automator] CSI Challan Path: " + csiPath);

        // Background Polling & Automation Thread
        Thread automationThread = new Thread(() -> {
            try {
                System.out.println("[GUI Automator] Waiting for UI components to render...");
                Thread.sleep(4000);

                int maxTries = 20;
                for (int attempt = 1; attempt <= maxTries; attempt++) {
                    System.out.println("[GUI Automator] Polling attempt " + attempt + " of " + maxTries + "...");
                    
                    boolean success = scanAndFillWindows(txtPath, errPath, csiPath);
                    if (success) {
                        System.out.println("[GUI Automator] Successfully located and populated input fields!");
                        pathsFilled = true;
                        break;
                    }
                    Thread.sleep(2000);
                }

                if (!pathsFilled) {
                    System.out.println("[GUI Automator Error] Timed out waiting for GUI text fields.");
                }

            } catch (Exception e) {
                e.printStackTrace();
            }
        });

        automationThread.setDaemon(true);
        automationThread.start();

        // Launch NSDL Main GUI
        try {
            System.out.println("[GUI Automator] Launching NSDL Desktop GUI Window (com.tin.FVU.FVU.main)...");
            Class<?> fvuClass = Class.forName("com.tin.FVU.FVU");
            Method mainMethod = fvuClass.getMethod("main", String[].class);
            mainMethod.invoke(null, (Object) new String[0]);
        } catch (Exception e) {
            System.out.println("[GUI Automator Error] Failed to launch NSDL main method.");
            e.printStackTrace();
        }
    }

    private static boolean scanAndFillWindows(String txt, String err, String csi) {
        Window[] windows = Window.getWindows();
        for (Window window : windows) {
            if (window.isShowing() && (window instanceof JFrame || window instanceof JDialog)) {
                boolean filled = searchAndFillContainer(window, txt, err, csi);
                if (filled) return true;
            }
        }
        return false;
    }

    private static boolean searchAndFillContainer(Container container, String txt, String err, String csi) {
        Component[] components = container.getComponents();
        int textFieldsFound = 0;

        for (Component comp : components) {
            if (comp instanceof JTextField) {
                JTextField tf = (JTextField) comp;
                
                // Lambda-র জন্য ইনডেক্স ফাইনাল ভ্যারিয়েবলে রূপান্তর করা হলো
                final int index = textFieldsFound; 

                SwingUtilities.invokeLater(() -> {
                    if (tf.getText() == null || tf.getText().trim().isEmpty()) {
                        if (index == 0) {
                            tf.setText(txt);
                        } else if (index == 1) {
                            tf.setText(err);
                        } else if (index >= 2) {
                            tf.setText(csi);
                        }
                    }
                });
                textFieldsFound++;
            } else if (comp instanceof Container) {
                if (searchAndFillContainer((Container) comp, txt, err, csi)) {
                    return true;
                }
            }
        }
        return textFieldsFound >= 2;
    }
}
