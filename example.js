import { createBot } from "mineflayer";
import { plugin, tasks } from "./index.js"


const bot = createBot({
    username:"Bot",
    version:"1.21.11"
})



bot.once("spawn", () => {
    bot.loadPlugin(plugin)

    bot.survival.loadTask(tasks.mainTask(bot))
})