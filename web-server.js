// ======================================================
// PAKKHATTA WEB SERVER (localhost mode)
// ------------------------------------------------------
// Chalane ka tareeqa:
//    npm run web
//    phir browser mein kholo:  http://localhost:3000
//
// Yeh server:
//   1. UI files (index.html, render.js, style.css) serve karta hai
//   2. Browser ke electronAPI calls ko /ipc/<channel>
//      par main.js ke handlers tak pohanchata hai
//   3. Wahi pakkhatta.db database use hota hai
// ======================================================

// Must be set BEFORE requiring main.js
process.env.PAKKHATTAWEB = "1";

const http = require("http");
const fs = require("fs");
const path = require("path");

// Registers all backend handlers into web-ipc
require("./main");

const bus = require("./web-ipc");
const db = require("./database");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};


function sendJSON(res, statusCode, obj) {
    const body = JSON.stringify(obj === undefined ? null : obj);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(body);
}


function serveStatic(res, urlPath) {

    let filePath =
        urlPath === "/" || urlPath === ""
            ? "/index.html"
            : urlPath;

    filePath = path.normalize(path.join(ROOT, filePath));

    // Prevent path traversal outside the project folder
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, data) => {

        if (error) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found: " + urlPath);
            return;
        }

        const type =
            MIME[path.extname(filePath).toLowerCase()] ||
            "application/octet-stream";

        res.writeHead(200, {
            "Content-Type": type,
            "Cache-Control": "no-cache"
        });
        res.end(data);

    });

}


function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => {
            data += chunk;
            if (data.length > 10 * 1024 * 1024) {
                reject(new Error("Payload too large."));
                req.destroy();
            }
        });
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}


// sql.js initializes asynchronously - wait until ready
async function waitForDatabase(retries = 150, delayMs = 100) {
    for (let i = 0; i < retries; i++) {
        try {
            db.prepare("SELECT COUNT(*) AS count FROM settings").get();
            return true;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return false;
}


async function start() {

    const dbReady = await waitForDatabase();

    if (!dbReady) {
        console.error("Warning: database did not become ready in time.");
    }


    const server = http.createServer(async (req, res) => {

        console.log(`[request] ${req.method} ${req.url}`);

        let url;

        try {
            url = new URL(req.url, `http://localhost:${PORT}`);
        } catch (error) {
            res.writeHead(400);
            res.end("Bad request");
            return;
        }


        // IPC bridge: POST /ipc/<channel>
        if (req.method === "POST" && url.pathname.startsWith("/ipc/")) {

            const channel =
                decodeURIComponent(url.pathname.slice("/ipc/".length));

            try {

                const raw = await readBody(req);

                let payload = null;

                if (raw) {
                    try {
                        payload = JSON.parse(raw);
                    } catch (parseError) {
                        payload = raw;
                    }
                }

                const result =
                    await bus.invoke(channel, payload);

                sendJSON(res, 200, result);

            } catch (error) {
                console.error(`IPC error [${channel}]:`, error.message);
                sendJSON(res, 500, {
                    success: false,
                    error: error.message
                });
            }

            return;
        }


        // Static files
        if (req.method === "GET") {
            serveStatic(res, url.pathname);
            return;
        }


        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method not allowed");

    });


    server.listen(PORT, () => {
        console.log("======================================");
        console.log("PakKhatta web server chal raha hai:");
        console.log("");
        console.log(`   http://localhost:${PORT}`);
        console.log("");
        console.log("Press Ctrl + C in this terminal to stop.");
        console.log("======================================");
    });

}


start();
