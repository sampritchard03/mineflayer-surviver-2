import fs from "node:fs";
import { createBot } from "mineflayer";
import { plugin, tasks } from "./index.js"
import mcData from "minecraft-data"


const bot = createBot({
    username:"Bot",
    version:"1.21.11"
})

const loadTask = () => bot.survival.loadTask(tasks.mineNearSurfaceTask(bot, (i)=>i.displayName.includes("Iron"), 10, "Iron"))

bot.once("spawn", () => {
    bot.loadPlugin(plugin)

    loadTask()
    /*
    const f = mcData(bot.version).entitiesArray.map(i => i.displayName).join("\n")
    fs.writeFileSync("./entity-names.txt", f, "utf8")
    console.log("Wrote item names to item-names.txt")*/

    bot.on("respawn", loadTask)
})