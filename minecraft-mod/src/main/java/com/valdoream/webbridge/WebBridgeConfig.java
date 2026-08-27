package com.valdoream.webbridge;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

public final class WebBridgeConfig {
    public static String SITE_URL = "https://valdoream.pages.dev";
    public static String API_KEY = "";
    public static int POLL_INTERVAL_TICKS = 40;

    private WebBridgeConfig() {}

    public static void load() {
        Path path = Path.of("config", "valdoream_webbridge.properties");
        Properties props = new Properties();

        if (Files.exists(path)) {
            try (var in = Files.newInputStream(path)) {
                props.load(in);
            } catch (IOException e) {
                ValdoreamWebBridgeMod.LOGGER.warn("Impossible de lire {} : {}", path, e.getMessage());
            }
        } else {
            props.setProperty("siteUrl", SITE_URL);
            props.setProperty("apiKey", "");
            props.setProperty("pollIntervalSeconds", "2");
            try {
                Files.createDirectories(path.getParent());
                try (var out = Files.newOutputStream(path)) {
                    props.store(out, "Valdoream Web Bridge — remplissez apiKey avec SERVER_API_KEY de Cloudflare");
                }
                ValdoreamWebBridgeMod.LOGGER.info("Fichier config cree : {}", path.toAbsolutePath());
            } catch (IOException e) {
                ValdoreamWebBridgeMod.LOGGER.warn("Impossible de creer {} : {}", path, e.getMessage());
            }
        }

        SITE_URL = props.getProperty("siteUrl", SITE_URL).replaceAll("/+$", "");
        API_KEY = props.getProperty("apiKey", "").trim();

        int seconds = 2;
        try {
            seconds = Integer.parseInt(props.getProperty("pollIntervalSeconds", "2"));
        } catch (NumberFormatException ignored) {}
        POLL_INTERVAL_TICKS = Math.max(20, seconds * 20);

        if (API_KEY.isEmpty()) {
            ValdoreamWebBridgeMod.LOGGER.error("apiKey vide dans config/valdoream_webbridge.properties — le bridge ne fonctionnera pas.");
        }
    }
}
