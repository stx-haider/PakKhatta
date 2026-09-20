// ======================================================
// PAKKHATTA IPC BRIDGE (web mode)
// ------------------------------------------------------
// Electron ke ipcMain ka lightweight replacement.
// web-server.js isko require karke browser requests
// ko main.js ke handlers tak pohanchata hai.
// ======================================================

const handlers = new Map();


module.exports = {

    // Same signature as electron's ipcMain.handle()
    handle(channel, handler) {
        handlers.set(channel, handler);
    },

    // Same signature as ipcRenderer.invoke()
    async invoke(channel, payload) {
        const handler = handlers.get(channel);
        if (!handler) {
            throw new Error("No handler registered for channel: " + channel);
        }
        return await handler(null, payload);
    },

    has(channel) {
        return handlers.has(channel);
    }

};
