import pfr from "mineflayer-pathfinder"
const {goals} = pfr
import { isStone, isLog, swingTime, timeout, isDirt, itemTier, isCreeperExploding, isGoodRawFood, isGoodCookedFood, shouldHunt } from "./utils.js"

export function mainTask(bot) {
    let attackTask = attackMobsTask(bot)
    let itemsTask = collectItemsTask(bot)
    let currentTask = null

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
            else if (!bot.survival.task.isFinished()) return bot.survival.task
            return null
        }

        onTick() { // with this system, all tasks think they are active. This affects shouldContinue().
            this.search()

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
    const reach = 4
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
    var hunt = huntTask(bot, 64)
    class EarlyProgressionTask extends Task {
        onStart() {

        };

        search() {
            hunt.search()
        }

        onTick() {
            if (getStoneTools.shouldContinue()) return getStoneTools

            if (!hunt.isFinished()) return hunt

            if (!getStoneTools.isFinished()) return getStoneTools
            return null
        };

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isFinished() {return getStoneTools.isFinished() && hunt.isFinished()}

        isEqual(other) {return other instanceof EarlyProgressionTask};
    }

    return new EarlyProgressionTask()
}

export function attackMobsTask(bot) {
    var attackTime = 0
    var entities = []
    const reach = 4

    class AttackMobsTask extends Task {
        constructor() {
            super()
        }

        onStart() {
        };

        attackRange(e) {
            if (e.displayName == "Skeleton" || e.displayName == "Witch") return 0
            if (isCreeperExploding(e)) return 20
            return reach
        }

        aggroRange(e) {
           if (e.displayName == "Skeleton" || isCreeperExploding(e)) return 20
           return 10
        }

        getGoals() {
            const ret = []
            for (let e of entities) {
                const r = this.attackRange(e)
                
                ret.push(new goals.GoalInvert(new goals.GoalFollow(e, r)))
                ret.push(new goals.GoalFollow(e, r+2))
            }
            return ret
        }

        equipSword(cb) {
            const sword = bot.inventory.sword()
            if (!sword) {
                cb()
                return
            }
            bot.equip(sword).then(cb)
        }

        search() {
            entities = bot.sortedEntities(e =>
                e.kind == "Hostile mobs" &&
                e.displayName != "Enderman" &&
                e.position.distanceTo(bot.entity.position) < this.aggroRange(e) &&
                (bot.canSeeMob(e) || isCreeperExploding(e))
            )
        }

        onTick() {
            if (entities.length > 0) {
                if ((attackTime % swingTime(bot.inventory.sword()) == 0 || attackTime % 4 == 0 && isCreeperExploding(entities[0])) && bot.entity.position.distanceTo(entities[0].position) < reach) {
                    this.equipSword(() => {if (entities[0]) bot.attack(entities[0])})
                    
                }

                if (!(bot.pathfinder.goal instanceof goals.GoalCompositeAll) || attackTime % 4 == 0) {
                    bot.pathfinder.setGoal(new goals.GoalCompositeAll(this.getGoals()))
                }

            }
            attackTime++
            return null
        };

        isFinished() {return entities.length == 0}

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isEqual(other) {return other instanceof AttackMobsTask};
    }

    return new AttackMobsTask()
}

export function placeCraftingTableTask(bot) {
    var digWoodTask = null;
    var craftingTable = null
    var locked = false
    const range = 4
    const longRange = 16
    class PlaceCraftingTableTask extends Task {
        onStart() {
            digWoodTask = digBlockTask(bot, isLog, 16)
            locked = false
        }

        search() {
            craftingTable = bot.findBlock({
                matching: bot.registry.blocksByName.crafting_table.id,
                maxDistance: range
            })
            return craftingTable
        }

        onTick() {
            if (locked) return null

            const p = bot.findBlocks({
                matching: bot.registry.blocksByName.crafting_table.id,
                maxDistance: longRange
            })[0]

            if (p && (
                !(bot.pathfinder.goal instanceof goals.GoalNear) ||
                bot.pathfinder.goal.x != p.x ||
                bot.pathfinder.goal.y != p.y ||
                bot.pathfinder.goal.z != p.z
            )) {
                bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, range-1))
            }

            if (p) return null

            if (digWoodTask.shouldContinue()) return digWoodTask

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
            return !!craftingTable
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isEqual(other) {return other instanceof PlaceCraftingTableTask};
    }

    return new PlaceCraftingTableTask()
}

export function getStoneToolsTask(bot) {
    var woodPickTask = null
    var digWoodTask = null;
    var digStoneTask = null
    var craftingTableTask = null;
    var needsCraftingTable = false
    var locked
    class GetStoneToolsTask extends Task {
        
        onStart() {
            woodPickTask = getWoodPickTask(bot)
            digWoodTask = digBlockTask(bot, isLog, 16, "Wood")
            digStoneTask = digBlockTask(bot, isStone, 16, "Stone")
            craftingTableTask = placeCraftingTableTask(bot)
            locked = false
        }

        onTick() {
            if (locked) return null
            if (needsCraftingTable || craftingTableTask.shouldContinue()) {
                needsCraftingTable = false
                craftingTableTask.search()
                return craftingTableTask
            }
            if (digWoodTask.shouldContinue()) return digWoodTask
            if (digStoneTask.shouldContinue()) return digStoneTask

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
                        const craftingTable = craftingTableTask.search()
                        if (!craftingTable) return true

                        locked = true
                        try {
                            await bot.craftItem(id, 1, craftingTable)
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

            if (locked) return null

            if (!digStoneTask.isFinished()) {
                if (!bot.inventory.pickaxe()) return woodPickTask
                return digStoneTask
            }

            if (!digWoodTask.isFinished())
                return digWoodTask

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
    var digWoodTask = null;
    var craftingTableTask = null;
    var locked
    class GetWoodPickTask extends Task {
        onStart() {
            digWoodTask = digBlockTask(bot, isLog, 16, "Wood")
            craftingTableTask = placeCraftingTableTask(bot)
            locked = false
        }

        onTick() {
            if (locked) return null
            if (digWoodTask.shouldContinue()) return digWoodTask

            const id = bot.registry.itemsByName.wooden_pickaxe.id
            const plan = bot.planCraftInventory({ id: id, count: 1 })

            if (plan.status == "complete") {
                const craftingTable = craftingTableTask.search()
                if (!craftingTable) return craftingTableTask

                locked = true
                bot.craftItem(id, 1, craftingTable)
                    .then(v => locked = false)
                    .catch(e => {console.error("GetPickTask: ", e); locked = false})

                return null
            }

            return digWoodTask
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
    class CollectItemsTask extends Task {
        constructor() {
            super()
            this.range = 10
        }

        search() {
            entity = bot.sortedEntities(e => {
                const item = e.getDroppedItem?.()
                const d = e.position.distanceTo(bot.entity.position)
                return item && e.position && d < this.range && bot.survival.isItemNeeded(item)
            })[0]
            return entity
        }

        onTick() {
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
    const wander = new goals.GoalNearXZ(30000000, 30000000, 0)
    count = Number(count)
    class DigBlockTask extends Task {

        constructor() {
            super()
            this.pred = pred
            this.count = count
            this.digging = false
        }

        onStart() {
            blocks = []
            currentCount = bot.inventory.getCount(pred)
        }

        async digWithBestTool(b) {
            const tool = bot.pathfinder.bestHarvestTool(b)
            if (tool) await bot.equip(tool, "hand")
            await bot.dig(b, true)
        }

        onTick() {
            currentCount = bot.inventory.getCount(pred)
            if (this.digging) return null

            blocks = bot.findBlocks({matching:pred, maxDistance:32}).slice(0, count-currentCount)

            const p = blocks[0]
            if (!p) {
                console.error("No blocks found!")
                bot.pathfinder.setGoal(wander)

                return null
            }
            if (bot.entity.position.distanceTo(p) < 3 && !bot.targetDigBlock && !this.digging) {
                const b = bot.blockAt(p)
                this.digging = true
                this.digWithBestTool(b)
                    .catch(e => {})
                    .finally(() => { this.digging = false })
                
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

class Task {

    onStart() {};

    onTick() {return null};

    // interruptTask = null if the task stopped cleanly
    onStop(interruptTask) {};

    isEqual(other) {return false};

    isFinished() {return false}

    debugString() {return ""}

    sub = null;

    first = true;

    stopped = false;

    active = false;

    cancel() {}

    tick() {
        if (this.first) {
            //Debug.logInternal("Task START: " + this);
            this.active = true;
            this.onStart()
            this.first = false;
            this.stopped = false;
        }
        if (this.stopped) return;

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
    }

    reset() {
        this.first = true;
        this.active = false;
        this.stopped = false;
    }

    stop() {
        stop(null);
    }

    /**
     * Stops the task. Next time it's run it will run `onStart`
     */
    stop(interruptTask) {
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