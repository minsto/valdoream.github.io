package com.valdoream.webbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class WebBridgeService {
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ValdoreamWebBridge");
        t.setDaemon(true);
        return t;
    });

    private static volatile MinecraftServer server;
    private static volatile boolean running;

    private WebBridgeService() {}

    public static void start(MinecraftServer srv) {
        server = srv;
        running = true;
    }

    public static void stop() {
        running = false;
        server = null;
    }

    public static void tick(MinecraftServer srv) {
        if (!running || WebBridgeConfig.API_KEY.isEmpty()) return;

        EXEC.submit(() -> runCycle(srv));
    }

    private static void runCycle(MinecraftServer srv) {
        try {
            processQueue(srv);
            pushStatus(srv);
        } catch (Exception e) {
            ValdoreamWebBridgeMod.LOGGER.warn("Cycle Web Bridge echoue : {}", e.getMessage());
        }
    }

    private static void processQueue(MinecraftServer srv) throws Exception {
        JsonObject payload = WebApiClient.fetchQueue();
        if (!payload.has("pending")) return;

        JsonArray pending = payload.getAsJsonArray("pending");
        for (var el : pending) {
            JsonObject entry = el.getAsJsonObject();
            long id = entry.get("id").getAsLong();
            String command = entry.get("command").getAsString();
            String player = entry.has("player") ? entry.get("player").getAsString() : "?";

            srv.execute(() -> {
                try {
                    CommandSourceStack source = srv.createCommandSourceStack()
                            .withPermission(4)
                            .withSuppressedOutput();

                    String cmd = command.startsWith("/") ? command.substring(1) : command;
                    ValdoreamWebBridgeMod.LOGGER.info("[WebBridge] Execute pour {} : {}", player, cmd);
                    LogCapture.add("[WebBridge] > " + cmd + " (" + player + ")");

                    srv.getCommands().performPrefixedCommand(source, cmd);
                    LogCapture.add("[WebBridge] OK : " + cmd);

                    EXEC.submit(() -> {
                        try {
                            WebApiClient.ackQueue(id, "done", null);
                        } catch (Exception ex) {
                            ValdoreamWebBridgeMod.LOGGER.warn("Ack echoue : {}", ex.getMessage());
                        }
                    });
                } catch (Exception ex) {
                    ValdoreamWebBridgeMod.LOGGER.warn("Commande echouee : {}", ex.getMessage());
                    LogCapture.add("[WebBridge] ERREUR : " + ex.getMessage());
                    EXEC.submit(() -> {
                        try {
                            WebApiClient.ackQueue(id, "failed", ex.getMessage());
                        } catch (Exception ackEx) {
                            ValdoreamWebBridgeMod.LOGGER.warn("Ack echoue : {}", ackEx.getMessage());
                        }
                    });
                }
            });
        }
    }

    private static void pushStatus(MinecraftServer srv) throws Exception {
        List<String> players = new ArrayList<>();
        for (ServerPlayer p : srv.getPlayerList().getPlayers()) {
            players.add(p.getGameProfile().getName());
        }

        List<String> logs = LogCapture.drain();
        double tps = srv.getAverageTickTimeNanos() / 1_000_000.0;
        double tpsFormatted = Math.min(20.0, 1000.0 / Math.max(1.0, tps));

        WebApiClient.pushSync(
                logs,
                players,
                players.size(),
                srv.getPlayerList().getMaxPlayers(),
                tpsFormatted
        );
    }
}
