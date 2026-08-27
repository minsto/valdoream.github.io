package com.valdoream.webbridge;

import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

public class WebBridgeEvents {
    private int tickCounter = 0;

    @SubscribeEvent
    public void onServerStarted(ServerStartedEvent event) {
        WebBridgeConfig.load();
        WebBridgeService.start(event.getServer());
        ValdoreamWebBridgeMod.LOGGER.info("Web Bridge actif — site: {}", WebBridgeConfig.SITE_URL);
    }

    @SubscribeEvent
    public void onServerStopping(ServerStoppingEvent event) {
        WebBridgeService.stop();
    }

    @SubscribeEvent
    public void onServerTick(ServerTickEvent.Post event) {
        if (event.getServer().isDedicatedServer() || event.getServer().isPublished()) {
            tickCounter++;
            int interval = WebBridgeConfig.POLL_INTERVAL_TICKS;
            if (tickCounter >= interval) {
                tickCounter = 0;
                WebBridgeService.tick(event.getServer());
            }
        }
    }
}
