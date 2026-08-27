package com.valdoream.webbridge;

import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.config.plugins.Plugin;
import org.apache.logging.log4j.core.config.plugins.PluginAttribute;
import org.apache.logging.log4j.core.config.plugins.PluginFactory;
import org.apache.logging.log4j.core.layout.PatternLayout;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

public final class LogCapture {
    private static final ConcurrentLinkedQueue<String> BUFFER = new ConcurrentLinkedQueue<>();
    private static final int MAX_BUFFER = 500;

    private LogCapture() {}

    public static void install() {
        // Les logs WebBridge sont ajoutes manuellement ; le reste vient de l'appender si present.
    }

    public static void add(String line) {
        BUFFER.add(line);
        while (BUFFER.size() > MAX_BUFFER) BUFFER.poll();
    }

    public static List<String> drain() {
        List<String> out = new ArrayList<>();
        String line;
        while ((line = BUFFER.poll()) != null) {
            out.add(line);
        }
        return out;
    }

    @Plugin(name = "ValdoreamWebLog", category = "Core", elementType = "appender", printObject = true)
    public static class ValdoreamAppender extends AbstractAppender {
        protected ValdoreamAppender(String name) {
            super(name, null, PatternLayout.createDefaultLayout(), true, Property.EMPTY_ARRAY);
        }

        @Override
        public void append(LogEvent event) {
            String msg = event.getMessage().getFormattedMessage();
            if (msg != null && !msg.isBlank()) {
                LogCapture.add("[" + event.getLevel().name() + "] " + msg);
            }
        }

        @PluginFactory
        public static ValdoreamAppender create(@PluginAttribute("name") String name) {
            return new ValdoreamAppender(name == null ? "ValdoreamWebLog" : name);
        }
    }
}
