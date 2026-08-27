package com.valdoream.webbridge;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

@Mod(ValdoreamWebBridgeMod.MOD_ID)
public class ValdoreamWebBridgeMod {
    public static final String MOD_ID = "valdoream_webbridge";
    public static final Logger LOGGER = LogManager.getLogger("ValdoreamWebBridge");

    public ValdoreamWebBridgeMod(IEventBus modBus) {
        NeoForge.EVENT_BUS.register(new WebBridgeEvents());
        LogCapture.install();
        LOGGER.info("Valdoream Web Bridge charge — panel admin pret a se connecter.");
    }
}
