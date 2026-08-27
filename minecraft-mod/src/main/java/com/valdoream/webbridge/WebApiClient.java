package com.valdoream.webbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

public final class WebApiClient {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private WebApiClient() {}

    public static JsonObject fetchQueue() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(WebBridgeConfig.SITE_URL + "/api/minecraft/queue"))
                .header("X-Server-Key", WebBridgeConfig.API_KEY)
                .header("Accept", "application/json")
                .GET()
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new RuntimeException("queue HTTP " + res.statusCode() + ": " + res.body());
        }
        return JsonParser.parseString(res.body()).getAsJsonObject();
    }

    public static void ackQueue(long id, String status, String error) throws Exception {
        JsonObject body = new JsonObject();
        body.addProperty("id", id);
        body.addProperty("status", status);
        if (error != null && !error.isEmpty()) {
            body.addProperty("error", error);
        }

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(WebBridgeConfig.SITE_URL + "/api/minecraft/queue"))
                .header("X-Server-Key", WebBridgeConfig.API_KEY)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new RuntimeException("ack HTTP " + res.statusCode());
        }
    }

    public static void pushSync(List<String> logs, List<String> players, int online, int maxPlayers, double tps) throws Exception {
        JsonObject body = new JsonObject();
        JsonArray logArr = new JsonArray();
        for (String line : logs) logArr.add(line);
        body.add("logs", logArr);

        JsonArray playerArr = new JsonArray();
        for (String p : players) playerArr.add(p);
        body.add("players", playerArr);

        body.addProperty("online", online);
        body.addProperty("maxPlayers", maxPlayers);
        body.addProperty("tps", tps);
        body.addProperty("modVersion", "1.0.0");

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(WebBridgeConfig.SITE_URL + "/api/minecraft/sync"))
                .header("X-Server-Key", WebBridgeConfig.API_KEY)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            throw new RuntimeException("sync HTTP " + res.statusCode() + ": " + res.body());
        }
    }
}
