import {digBlockTask, attackMobsTask, mainTask} from "./tasks.js"
import { itemTier } from "./utils.js"


export const tasks = {
    digBlockTask,
    attackMobsTask,
    mainTask
}

export const plugin = (bot) => {
    var task = null
    
    bot.loadTask = (t) => {
        task = t
    }

    function tool (partialName) {
        var bestItem = null;
        var bestTier = 0;
        //0:wood/leather, 1:gold, 2:stone/chainmail, 3:iron, 4:diamond, 5:netherite
        for (let item of bot.inventory.items()) {
            if (item.displayName.includes(partialName)) {
            const tier = itemTier(item)
                if (tier > bestTier) {
                    bestItem = item
                    bestTier = tier
                }
            }
        }

        return bestItem
    }

    bot.inventory.getCount = (partialName) => {
        var count = 0;
        for (let item of bot.inventory.items())
            if (item.displayName.includes(partialName))
                count += item.count
        return count
    }

    bot.inventory.sword = () => {const ret = tool("Sword"); if (ret) ret.tier = itemTier(ret); return ret}
    bot.inventory.axe = () => {const ret = tool("Axe"); if (ret) ret.tier = itemTier(ret); return ret}
    bot.inventory.shovel = () => {const ret = tool("Shovel"); if (ret) ret.tier = itemTier(ret); return ret}
    bot.inventory.pickaxe = () => {const ret = tool("Pickaxe"); if (ret) ret.tier = itemTier(ret); return ret}

    bot.on("physicsTick", () => {
        if (task) task.tick()
    })

}


