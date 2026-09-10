import {digBlockTask, placeCraftingTableTask, collectItemsTask, getWoodPickTask, getStoneToolsTask, attackMobsTask, mainTask} from "./tasks.js"
import { itemTier } from "./utils.js"
import pfr from "mineflayer-pathfinder"
const {pathfinder, goals, Movements} = pfr
import { plugin as craftingUtil } from "mineflayer-crafting-util"
import {Vec3} from "vec3"


export const tasks = {
    digBlockTask,
    placeCraftingTableTask,
    collectItemsTask,
    getWoodPickTask,
    getStoneToolsTask,
    attackMobsTask,
    mainTask
}

export const plugin = (bot) => {
    bot.loadPlugin(pathfinder)
    const movements = new Movements(bot)
    movements.scafoldingBlocks = [bot.registry.itemsByName.dirt.id]
    bot.pathfinder.setMovements(movements)
    bot.loadPlugin(craftingUtil())

    var task = null
    
    bot.survival = {
        loadTask: (t) => {
            task = t
        },
        isItemNeeded: (item) => true
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

    bot.inventory.getCount = (pred=(item)=>false) => {
        var count = 0;
        for (let item of bot.inventory.items())
            if (pred(item))
                count += item.count
        return count
    }

    bot.inventory.getItem = (pred=item=>false) => {
        for (let item of bot.inventory.items())
            if (pred(item)) return item
    }

    bot.inventory.sword = () => {const ret = tool("Sword"); if (ret) ret.tier = itemTier(ret); return ret}
    bot.inventory.axe = () => {const ret = tool("Axe"); if (ret) ret.tier = itemTier(ret); return ret}
    bot.inventory.shovel = () => {const ret = tool("Shovel"); if (ret) ret.tier = itemTier(ret); return ret}
    bot.inventory.pickaxe = () => {const ret = tool("Pickaxe"); if (ret) ret.tier = itemTier(ret); return ret}

    bot.placeNearby = async (item, range=2) => {
        const block = item && bot.registry.blocksByName[item.name]
        if (!block) return false

        await bot.equip(item, "hand")

        const origin = bot.entity.position.floored()
        const directions = [
            {offset: new Vec3(0, 1, 0), face: new Vec3(0, 1, 0)},
            {offset: new Vec3(0, -1, 0), face: new Vec3(0, -1, 0)},
            {offset: new Vec3(1, 0, 0), face: new Vec3(1, 0, 0)},
            {offset: new Vec3(-1, 0, 0), face: new Vec3(-1, 0, 0)},
            {offset: new Vec3(0, 0, 1), face: new Vec3(0, 0, 1)},
            {offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, -1)}
        ]

        for (let attempt = 0; attempt < 20; attempt++) {
            const target = origin.offset(
                Math.floor(Math.random() * (range * 2 + 1)) - range,
                Math.floor(Math.random() * (range * 2 + 1)) - range,
                Math.floor(Math.random() * (range * 2 + 1)) - range
            )

            if (target.distanceTo(bot.entity.position) > range) continue
            if (bot.blockAt(target).boundingBox !== "empty") continue

            for (const direction of directions) {
                const reference = bot.blockAt(target.minus(direction.offset))
                if (reference && reference.boundingBox !== "empty") {
                    await bot.placeBlock(reference, direction.face)
                    return true
                }
            }
        }

        return false
    }

    bot.on("physicsTick", () => {
        if (task) task.tick()
    })

}


