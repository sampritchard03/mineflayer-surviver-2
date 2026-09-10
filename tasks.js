import pfr from "mineflayer-pathfinder"
const {goals} = pfr
import { isStone, isLog, swingTime, timeout } from "./utils.js"

export function mainTask(bot) {
    let toolsTask = null
    let itemsTask = null
    let attackTask = null

    class MainTask extends Task {
        onStart() {
            attackTask = attackMobsTask(bot)
            itemsTask = collectItemsTask(bot)
            toolsTask = getStoneToolsTask(bot)
        };

        onTick() {
            console.log(this.getHierarchy())
            if (attackTask.search()) return attackTask
            if (itemsTask.search()) return itemsTask
            if (!toolsTask.isFinished()) return toolsTask
            return null
        };

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            
        };

        isFinished() {return false}

        isEqual(other) {return false};
    }

    return new MainTask()
}

export function attackMobsTask(bot) {
    var attackTime = 0
    var entity = null

    class AttackMobsTask extends Task {
        constructor(aggroRange=10, attackrange=4) {
            super()
            this.aggroRange = aggroRange
            this.attackRange = attackrange
        }

        onStart() {
        };

        equipSword(cb) {
            const sword = bot.inventory.sword()
            if (!sword) {
                cb()
                return
            }
            bot.equip(sword).then(cb)
        }

        search() {
            entity = Object.values(bot.entities).filter(e => e.kind == "Hostile mobs" && e.position.distanceTo(bot.entity.position) < this.aggroRange)[0]
            return entity
        }

        onTick() {
            if (entity) {
                if (!(bot.pathfinder.goal instanceof goals.GoalCompositeAll) || bot.pathfinder.goal.goals[1].entity != entity) {
                    bot.pathfinder.setGoal(new goals.GoalCompositeAll([
                        new goals.GoalInvert(new goals.GoalFollow(entity, this.attackRange)),
                        new goals.GoalFollow(entity, this.attackRange+1)
                    ]))
                }
                if (attackTime > swingTime(bot.inventory.sword()) && bot.entity.position.distanceTo(entity.position) < this.attackRange) {
                    attackTime = 0
                    this.equipSword(() => bot.attack(entity))
                    
                }
            }
            attackTime++
            return null
        };

        isFinished() {return !entity}

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
    const range = 3
    class PlaceCraftingTableTask extends Task {
        onStart() {
            digWoodTask = digBlockTask(bot, isLog, 5)
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

            const id = bot.registry.itemsByName.crafting_table.id

            const table = bot.inventory.getItem(i => i.type == id)
        
            if (table) {
                bot.placeNearby(table).catch(e => console.error("PlaceCraftingTableTask: ", e))
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
                    .then(v => locked = false)
                    .catch(e => {console.error("PlaceCraftingTableTask: ", e); locked = false})

                return null
            }

            return digWoodTask
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
    var locked
    class GetStoneToolsTask extends Task {
        
        onStart() {
            woodPickTask = getWoodPickTask(bot)
            digWoodTask = digBlockTask(bot, isLog, 5)
            digStoneTask = digBlockTask(bot, isStone, 12)
            craftingTableTask = placeCraftingTableTask(bot)
            locked = false
        }

        onTick() {
            if (locked) return null

            const items = bot.registry.itemsByName

            const ids = [items.stone_pickaxe.id, items.stone_axe.id, items.stone_shovel.id, items.stone_sword.id]
            const tools = ["pickaxe", "axe", "shovel", "sword"]

            locked = false
            ;(async () => {
                for (let i = 0; i < ids.length; i++) {
                    const tool = bot.inventory[tools[i]]()
                    if (tool && tool.tier > 1) continue

                    const id = ids[i]

                    const plan = bot.planCraftInventory({ id: id, count: 1 })

                    if (plan.status == "complete") {
                        const craftingTable = craftingTableTask.search()
                        if (!craftingTable) return craftingTableTask

                        locked = true
                        try {
                            await bot.craftItem(id, 1, craftingTable)
                        } catch(e) {
                            console.error("GetStoneToolsTask:", e)
                        }
                        locked = false
                    }
                }
            })().then(() => locked = false)

            if (locked) return null

            if (!digStoneTask.isFinished()) {
                if (!bot.inventory.pickaxe()) return woodPickTask
                return digStoneTask
            }

            return digWoodTask
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
            digWoodTask = digBlockTask(bot, isLog, 5)
            craftingTableTask = placeCraftingTableTask(bot)
            locked = false
        }

        onTick() {
            if (locked) return null

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
        onStart() {
            this.range = 10
            entity = null
        }

        search() {
            entity = Object.values(bot.entities).filter(e => e.position && e.position.distanceTo(bot.entity.position) < this.range && bot.survival.isItemNeeded(e.getDroppedItem()))[0]
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

export function digBlockTask(bot, pred=(item)=>false, count) {
    var t = 0
    class DigBlockTask extends Task {

        constructor() {
            super()
            this.pred = pred
            this.count = count
        }

        onStart() {

        }

        equipBestTool(b, cb) {
            const tool = bot.pathfinder.bestHarvestTool(b)
            if (!tool) {
                cb()
                return
            }
            bot.equip(tool).then(cb)
        }

        onTick() {

            const p = bot.findBlocks({matching:pred, maxDistance:32})[0]
            if (bot.entity.position.distanceTo(p) < 3 && !bot.targetDigBlock) {
                const b = bot.blockAt(p)
                this.equipBestTool(b, () => bot.dig(b, true).catch(e => {}))
                
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

        isFinished() {
            return bot.inventory.getCount(pred) >= count
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            bot.pathfinder.stop()
            bot.stopDigging()
        };

        isEqual(other) {return other instanceof DigBlockTask && other.pred == pred && other.count == count};
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
            hierarchy.push(task.constructor.name)
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
}