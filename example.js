import { createBot } from "mineflayer";
import pfr from "mineflayer-pathfinder"
const {pathfinder, goals} = pfr
import { plugin, tasks } from "./index.js"

const bot = createBot({
    username:"Bot",
    version:"1.21.4"
})



bot.once("spawn", () => {
    bot.loadPlugin(pathfinder)
    bot.loadPlugin(plugin)

    bot.loadTask(tasks.mainTask(bot))
})