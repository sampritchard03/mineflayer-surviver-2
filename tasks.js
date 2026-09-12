import pfr from "mineflayer-pathfinder"
const {goals} = pfr
import {Vec3} from "vec3"
import { isStone, isLog, swingTime, timeout, isDirt, itemTier, isCreeperExploding, isGoodRawFood, isGoodCookedFood, shouldHunt } from "./utils.js"

function getClosestDist(tasks) {
    var closestDist = Infinity
    for (let task of tasks) {
        if (task && task.shouldContinue()) {
            const h = task.distanceTo()
            if (h < closestDist) closestDist = h
        } 
    }
    if (closestDist == Infinity) for (let task of tasks) {
        if (task && !task.isFinished()) {
            const h = task.distanceTo()
            if (h < closestDist) closestDist = h
        } 
    }
    return closestDist
}

function getClosestTask(tasks) {
    var closestTask = null
    var closestDist = Infinity
    for (let task of tasks) {
        if (task && task.shouldContinue()) {
            const h = task.distanceTo()
            if (h < closestDist) {
                closestTask = task
                closestDist = h
            }
        } 
    }
    if (closestDist == Infinity) for (let task of tasks) {
        if (task && !task.isFinished()) {
            const h = task.distanceTo()
            if (h < closestDist) {
                closestTask = task
                closestDist = h
            }
        } 
    }
    return closestTask
}

export function mainTask(bot) {
    let attackTask = attackMobsTask(bot)
    let itemsTask = collectItemsTask(bot)
    let currentTask = null
    let t = 0

    class MainTask extends Task {
        onStart() {

        };

        search() {
            attackTask.search()
            itemsTask.search()
            bot.survival.task?.search?.()
        }

        chooseTask() {
            if (!attackTask.isFinished()) return attackTask
            else if (!itemsTask.isFinished()) return itemsTask
            else if (bot.survival.task && !bot.survival.task.isFinished()) return bot.survival.task
            return null
        }

        onTick() { // with this system, all tasks think they are active. This affects shouldContinue().
            const task = this.chooseTask()
            if (task != currentTask) {
                if (currentTask) 
                    currentTask.onStop(task)
                currentTask = task
            }
            if (currentTask) {
                console.log(currentTask.getHierarchy())
                currentTask.tick()
            }
            t++
            return null
        };

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isFinished() {return false}

        isEqual(other) {return other instanceof MainTask};
    }

    return new MainTask()
}

export function huntTask(bot, count) {
    var entity = null
    var attackTime = 0
    const reach = 3
    class HuntTask extends Task {
        onStart() {
            entity = null
        };

        search() {
            entity = bot.sortedEntities(shouldHunt)[0]
        }

        equipSword(cb) {
            const sword = bot.inventory.sword()
            if (!sword) {
                cb()
                return
            }
            bot.equip(sword).then(cb)
        }

        distanceTo(p=bot.entity.position) {
            return bot.entity.position.distanceTo(p) * (bot.food/20)
        }

        onTick() {
            if (entity) {
                if ((attackTime % swingTime(bot.inventory.sword()) == 0) && bot.entity.position.distanceTo(entity.position) < reach) {
                    this.equipSword(() => {if (entity) bot.attack(entity)})
                    
                }

                if (!(bot.pathfinder.goal instanceof goals.GoalFollow) || bot.pathfinder.goal.entity != entity) {
                    bot.pathfinder.setGoal(new goals.GoalFollow(entity, 0))
                }

            }
            attackTime++
            return null
        };

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            entity = null
        };

        isFinished() {return entity == null || !bot.inventory.sword() || bot.inventory.getCount(i => isGoodRawFood(i) || isGoodCookedFood(i)) >= count}

        isEqual(other) {return other instanceof HuntTask && other.count == count};

        debugString() {
            if (!entity) return ""
            return entity.displayName + ", " + bot.inventory.getCount(i => isGoodRawFood(i) || isGoodCookedFood(i)) + ", " + count
        }
    }

    return new HuntTask()
}

export function earlyProgressionTask(bot) {
    var getStoneTools = getStoneToolsTask(bot)
    var hunt = huntTask(bot, 24)
    var digDirt = digBlockTask(bot, isDirt, 16, "Dirt")
    var digWood = digBlockTask(bot, isLog, 6, "Wood")
    const tasks = [getStoneTools, hunt, digDirt, digWood]

    class EarlyProgressionTask extends Task {
        onStart() {

        };

        search() {
            hunt.search()
            getStoneTools.search()
            digDirt.search()
            digWood.search()
        }

        distanceTo() {
            return getClosestDist(tasks)
        }

        onTick() {
            const task = getClosestTask(tasks) 
            if (!task && !getStoneTools.isFinished()) return getStoneTools
            return task
        };

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isFinished() {
            return getStoneTools.isFinished() && hunt.isFinished()
        }

        isEqual(other) {return other instanceof EarlyProgressionTask};
    }

    return new EarlyProgressionTask()
}

export function attackMobsTask(bot) {
    var attackTime = 0
    var entities = []
    var attackInProgress = false
    var goalKey = ""
    const reach = 3

    const attackRange = (e) => {
        if (e.displayName == "Skeleton" || e.displayName == "Witch") return 0
        if (isCreeperExploding(e)) return 20
        return reach
    }

    const aggroRange = (e) => {
        if (e.displayName == "Skeleton" || isCreeperExploding(e)) return 20
        return 10
    }

    class AttackMobsTask extends Task {
        constructor() {
            super()
        }

        onStart() {
        };

        getGoals() {
            const ret = []
            for (let e of entities) {
                const r = attackRange(e)
                
                ret.push(new goals.GoalInvert(new goals.GoalFollow(e, r)))
                ret.push(new goals.GoalFollow(e, r+2))
            }
            return ret
        }

        attack(entity) {
            if (attackInProgress) return

            attackInProgress = true

            bot.lookAt(entity.position.offset(0, entity.height, 0), true)
                .then(() => {
                    const sword = bot.inventory.sword()
                    if (!sword) bot.attack(entity)
                    else bot.equip(sword, "hand").then(() => bot.attack(entity))
                })
                .catch(e => console.error("AttackMobsTask: ", e))
                .finally(() => attackInProgress = false)
        }

        search() {
            entities = bot.sortedEntities(e =>
                e.kind == "Hostile mobs" &&
                e.displayName != "Enderman" &&
                e.position.distanceTo(bot.entity.position) < aggroRange(e) &&
                (bot.canSeeMob(e) || isCreeperExploding(e))
            )
            const nextGoalKey = entities.map(e => e.id).join(",")
            if (nextGoalKey != goalKey) goalKey = ""
        }

        onTick() {
            if (entities.length > 0) {
                if (
                    !attackInProgress && 
                    (attackTime % swingTime(bot.inventory.sword()) == 0 || attackTime % 4 == 0 && isCreeperExploding(entities[0])) && 
                    bot.entity.position.distanceTo(entities[0].position) < reach+0.5
                ) {
                    this.attack(entities[0])
                    
                }

                if (!(bot.pathfinder.goal instanceof goals.GoalCompositeAll) || !goalKey) {
                    bot.pathfinder.setGoal(new goals.GoalCompositeAll(this.getGoals()))
                    goalKey = entities.map(e => e.id).join(",")
                }

            }
            attackTime++
            return null
        };

        isFinished() {return entities.length == 0}

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            attackInProgress = false
            goalKey = ""
        };

        isEqual(other) {return other instanceof AttackMobsTask};
    }

    return new AttackMobsTask()
}

export function placeCraftingTableTask(bot) {
    var digWoodTask = digBlockTask(bot, isLog, 1, "Wood")
    var craftingTable = null
    var locked = false
    const reach = 3
    class PlaceCraftingTableTask extends Task {
        onStart() {
            locked = false
        }

        distanceTo() {
            if (locked) return 0
            if (craftingTable) return craftingTable.position.distanceTo(bot.entity.position)
            return Infinity
        }

        search() {
            digWoodTask.search()
            const p = bot.findBlocks({matching:b=>b.displayName == "Crafting Table", maxDistance:32}).sort((a, b) => {
                const distanceA = bot.entity.position.distanceTo(a)
                const distanceB = bot.entity.position.distanceTo(b)
                return distanceA - distanceB // Closest first. Flip to (distanceB - distanceA) for farthest first.
            })[0]
            if (p) craftingTable = bot.blockAt(p)
        }

        getCraftingTable() {
            return craftingTable
        }

        onTick() {
            if (locked) return null

            const p = craftingTable?.position
            if (p && (
                !(bot.pathfinder.goal instanceof goals.GoalNear) ||
                bot.pathfinder.goal.x != p.x ||
                bot.pathfinder.goal.y != p.y ||
                bot.pathfinder.goal.z != p.z
            )) {
                bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 2))
            }

            if (p) return null

            const id = bot.registry.itemsByName.crafting_table.id

            const table = bot.inventory.getItem(i => i.type == id)
        
            if (table) {
                locked = true
                bot.placeNearby(table)
                    .catch(e => console.error("PlaceCraftingTableTask: ", e))
                    .finally(() => locked = false)
                return null
            }
            
            const plan = bot.planCraftInventory({ id: id, count: 1 })

            if (plan.status == "complete") {
                locked = true
                ;(async () => {
                    for (const recipe of plan.recipesToDo) {
                        await bot.craft(
                            recipe.recipe,
                            recipe.recipeApplications,
                            null
                        )
                    }
                })()
                    .catch(e => console.error("PlaceCraftingTableTask: ", e))
                    .finally(() => locked = false)

                return null
            }

            if (!digWoodTask.isFinished()) return digWoodTask
            return null
        };

        isFinished() {
            return craftingTable && craftingTable.position.distanceTo(bot.entity.position) < reach
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isEqual(other) {return other instanceof PlaceCraftingTableTask};
    }

    return new PlaceCraftingTableTask()
}

export function mineNearSurfaceTask(bot, pred, count, dStr) {
    return digBlockTask(bot, (b) => {
        if (!b.position) return pred(b)
        return pred(b) && b.position.y >= 60
    }, count, "NearSurface, "+dStr)
}

export function getStoneToolsTask(bot) {
    var digWoodTask = digBlockTask(bot, isLog, 6, "Wood")
    var woodPickTask = getWoodPickTask(bot)
    var digStoneTask = mineNearSurfaceTask(bot, isStone, 20, "Stone")
    var craftingTableTask = placeCraftingTableTask(bot)
    var needsCraftingTable = false
    var locked = false
    class GetStoneToolsTask extends Task {
        
        onStart() {
            locked = false
        }

        distanceTo() {
            if (locked) return 0
            const tasks = []
            if (!digWoodTask.isFinished()) tasks.push(digWoodTask)
            if (!woodPickTask.isFinished()) tasks.push(woodPickTask)
            else if (!digStoneTask.isFinished()) tasks.push(digStoneTask)
            if (needsCraftingTable) tasks.push(craftingTableTask)
            return getClosestDist(tasks)
        }

        search() {
            digWoodTask.search()
            woodPickTask.search()
            digStoneTask.search()
            craftingTableTask.search()
        }

        onTick() {
            if (locked) return null
            if (needsCraftingTable || craftingTableTask.shouldContinue()) {
                needsCraftingTable = false
                return craftingTableTask
            }

            if (digWoodTask.shouldContinue()) return digWoodTask
            if (woodPickTask.shouldContinue()) return woodPickTask
            else if (digStoneTask.shouldContinue()) return digStoneTask

            const items = bot.registry.itemsByName

            const ids = [items.stone_pickaxe.id, items.stone_axe.id, items.stone_shovel.id, items.stone_sword.id]
            const tools = ["pickaxe", "axe", "shovel", "sword"]

            locked = false
            ;(async () => {
                for (let i = 0; i < ids.length; i++) {
                    const tool = bot.inventory[tools[i]]()
                    if (tool && itemTier(tool) > 1) continue

                    const id = ids[i]

                    const plan = bot.planCraftInventory({ id: id, count: 1 })

                    if (plan.status == "complete") {
                        if (!craftingTableTask.isFinished()) return true

                        locked = true
                        try {
                            await bot.craftItem(id, 1, craftingTableTask.getCraftingTable())
                        } catch(e) {
                            console.error("GetStoneToolsTask:", e)
                        }
                        locked = false
                    }
                }
                return false
            })().then(b => {
                locked = false
                needsCraftingTable = b
            })

            if (!digWoodTask.isFinished()) return digWoodTask
            if (!woodPickTask.isFinished()) return woodPickTask
            if (!digStoneTask.isFinished()) return digStoneTask

            return null
        };

        isFinished() {
            const tools = [bot.inventory.pickaxe(), bot.inventory.axe(), bot.inventory.shovel(), bot.inventory.sword()]
            for (let tool of tools) if (tool == null || tool.tier < 2) return false
            return true
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {

        };

        isEqual(other) {return other instanceof GetStoneToolsTask};
    }

    return new GetStoneToolsTask()
}

export function getWoodPickTask(bot) {
    var diggingWoodTask = digBlockTask(bot, isLog, 6, "Wood")
    var craftingTableTask = placeCraftingTableTask(bot)
    var locked = false
    var needsCraftingTable = false
    class GetWoodPickTask extends Task {

        onStart() {
            locked = false
        }

        search() {
            diggingWoodTask.search()
            craftingTableTask.search()
        }

        distanceTo() {
            if (locked) return 0
            if (diggingWoodTask.shouldContinue()) return diggingWoodTask.distanceTo()
            return needsCraftingTable ? craftingTableTask.distanceTo() : Infinity
        }

        onTick() {
            if (locked) return null
            if (diggingWoodTask.shouldContinue()) return diggingWoodTask

            const id = bot.registry.itemsByName.wooden_pickaxe.id
            const plan = bot.planCraftInventory({ id: id, count: 1 })

            if (plan.status == "complete") {
                if (!craftingTableTask.isFinished()){
                    needsCraftingTable = true
                    return craftingTableTask
                } else {
                    needsCraftingTable = false
                }

                locked = true
                bot.craftItem(id, 1, craftingTableTask.getCraftingTable())
                    .then(v => locked = false)
                    .catch(e => {console.error("GetPickTask: ", e); locked = false})

                return null
            }

            if (!diggingWoodTask.isFinished()) return diggingWoodTask
            return null
        };

        isFinished() {
            return bot.inventory.pickaxe() != null
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {

        };

        isEqual(other) {return other instanceof GetWoodPickTask};
    }

    return new GetWoodPickTask()
}

export function collectItemsTask(bot) {
    var entity = null
    const range = 10
    class CollectItemsTask extends Task {
        constructor() {
            super(2)
        }

        search() {
            entity = bot.sortedEntities(e => {
                const item = e.getDroppedItem?.()
                const d = e.position.distanceTo(bot.entity.position)
                return item && e.position && d < range && bot.survival.isItemNeeded(item)
            })[0]
        }

        onTick() {
            if (!entity) return null
            if (!(bot.pathfinder.goal instanceof goals.GoalFollow) || bot.pathfinder.goal.entity != entity) {
                bot.pathfinder.setGoal(new goals.GoalFollow(entity, 0))
            }
            return null
        };

        isFinished() {
            return !entity
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            bot.pathfinder.stop()
        };

        isEqual(other) {return other instanceof CollectItemsTask};
    }

    return new CollectItemsTask()
}

export function digBlockTask(bot, pred=(item)=>false, count, dStr="") {
    var blocks = []
    var currentCount = null
    var locked = false
    const reach = 3
    const wander = new goals.GoalNearXZ(30000000, 30000000, 0)
    var t = 0
    count = Number(count)
    class DigBlockTask extends Task {

        constructor() {
            super(4)
            this.pred = pred
            this.count = count
            locked = false
        }

        search() {
            blocks = bot.findBlocks({matching:pred, maxDistance:32}).sort((a, b) => {
                const distanceA = bot.entity.position.distanceTo(a)
                const distanceB = bot.entity.position.distanceTo(b)
                return distanceA - distanceB // Closest first. Flip to (distanceB - distanceA) for farthest first.
            }).slice(0, count-currentCount)
        }   

        distanceTo() {
            if (locked) return 0
            return blocks.length ? bot.entity.position.distanceTo(blocks[0]) : Infinity
        }

        onStart() {
            blocks = []
            currentCount = bot.inventory.getCount(pred)
        }

        async digWithBestTool(p) {
            await bot.lookAt(p)
            var b1 = bot.blockAtCursor(reach)
            do {
                if (!b1) b1 = bot.blockAt(p)
                const tool = bot.pathfinder.bestHarvestTool(b1)
                if (tool) await bot.equip(tool, "hand")
                await bot.dig(b1, true, "raycast")
                await bot.lookAt(b.position)
                b1 = bot.blockAtCursor(reach)
            } while (p != b1.position)
        }

        onTick() {
            t++

            currentCount = bot.inventory.getCount(pred)
            if (locked) {
                bot.setControlState("jump", false)
                bot.pathfinder.stop()
                return null
            }

            const p = blocks[0]
            if (!p) {
                if (t > 20) {
                    console.error("No blocks found!")
                    bot.pathfinder.setGoal(wander)
                    t = 0
                }

                return null
            }
            
            const eyePosition = bot.entity.position.offset(0, bot.entity.eyeHeight, 0)
            const blockCenter = p.offset(0.5, 0.5, 0.5)
            if (eyePosition.distanceTo(blockCenter) <= reach && !bot.targetDigBlock) {
                bot.pathfinder.stop()
                locked = true
                this.digWithBestTool(p)
                    .catch(e => {})
                    .finally(() => { locked = false })
                
                return null
            }
            
            if (
                !(bot.pathfinder.goal instanceof goals.GoalGetToBlock) ||
                bot.pathfinder.goal.x != p.x ||
                bot.pathfinder.goal.y != p.y ||
                bot.pathfinder.goal.z != p.z
            ) {
                bot.pathfinder.setGoal(new goals.GoalGetToBlock(p.x, p.y, p.z))
            }
            return null
        };

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            blocks = []
            bot.pathfinder.stop()
            bot.stopDigging()
        };

        isFinished() {
            return currentCount >= count
        }

        isEqual(other) {return other instanceof DigBlockTask && other.pred == pred && other.count == count};

        debugString() {return dStr+", "+bot.inventory.getCount(pred)+", "+count}
    }

    return new DigBlockTask()
}

var totalTaskCount = 0

class Task {

    onStart() {};

    onTick() {return null};

    // interruptTask = null if the task stopped cleanly
    onStop(interruptTask) {};

    isEqual(other) {return false};

    isFinished() {return false}

    debugString() {return ""}
    
    search() {}

    sub = null;

    first = true;

    stopped = false;

    active = false;

    nestedSearch = false

    alreadySearched = false

    t = 0

    index = 0

    constructor() {
        this.index = totalTaskCount++
    }

    cancel() {}

    tick() {
        if (!this.nestedSearch) {
            this.nestedSearch = true
            const search = this.search
            this.search = () => {
                this.alreadySearched = true
                search()
            }
        }

        if (this.first) {
            //Debug.logInternal("Task START: " + this);
            this.active = true;
            this.onStart()
            this.first = false;
            this.stopped = false;
        }
        if (this.stopped) return;

        if ((this.t+this.index-1) % 10 == 0) {
            this.alreadySearched = false
        }

        if ((this.t+this.index) % 10 == 0) {
            if (!this.alreadySearched) this.search()
        }
        
        const newSub = this.onTick();
        // We have a sub task
        if (newSub != null) {
            if (!newSub.equals(this.sub)) {
                // Our sub task is new
                if (this.sub != null) {
                    // Our previous sub must be interrupted.
                    this.sub.stop(newSub);
                }

                this.sub = newSub;
            }

            // Run our child
            this.sub.tick();
        } else {
            // We are null
            if (this.sub != null && this.sub.isFinished()) {
                // Our previous sub must be interrupted.
                this.sub.stop();
                this.sub = null;
            }
        }
        this.t++
    }

    reset() {
        this.first = true;
        this.active = false;
        this.stopped = false;
    }

    /**
     * Stops the task. Next time it's run it will run `onStart`
     */
    stop(interruptTask=null) {
        if (!this.active) return;
        //Debug.logInternal("Task STOP: " + this + ", interrupted by " + interruptTask);

        if (!this.first) {
            this.onStop(interruptTask);
        }
        

        if (this.sub != null && !this.sub.stopped) {
            this.sub.stop(interruptTask);
        }

        this.first = true;
        this.active = false;
        this.stopped = true;
    }

    /**
     * Lets the task know it's execution has been "suspended"
     *
     * STILL RUNS `onStop`
     *
     * Doesn't stop it all-together (meaning `isActive` still returns true)
     */
    interrupt(interruptTask) {
        if (!this.active) return;
        if (!this.first) {
            onStop(interruptTask);
        }

        if (this.sub != null && !this.sub.stopped) {
            this.sub.interrupt(interruptTask);
        }

        this.first = true;
    }

    distanceTo() {
        return Infinity
    }

    toString() {
        return this.constructor.name;
    }

    getHierarchy() {
        const hierarchy = [this.constructor.name]
        let task = this.sub
        while (task != null) {
            hierarchy.push(task.constructor.name+" "+task.debugString())
            task = task.sub
        }
        return hierarchy.join(" -> ")
    }

    equals(obj) {
        return this == obj || this.isEqual(obj);
    }

    thisOrChildSatisfies(pred=(task)=>false) {
        t = this;
        while (t != null) {
            if (pred(t)) return true;
            t = t._sub;
        }
        return false;
    }

    shouldContinue() {
        return !this.isFinished() && this.active
    }
}