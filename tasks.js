import pfr from "mineflayer-pathfinder"
const {goals} = pfr
import { swingTime, timeout } from "./utils.js"

export function mainTask(bot) {
    let digTask = null
    let attackTask = null

    class MainTask extends Task {
        onStart() {
            attackTask = attackMobsTask(bot)
            digTask = digBlockTask(bot, "Log", 10)
        };

        onTick() {
            if (attackTask.search()) return attackTask
            if (digTask.isFinished()) digTask = digBlockTask(bot, "Log", 10)
            return digTask
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
                console.log(attackTime, entity)
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

export function digBlockTask(bot, partialName, count) {
    class DigBlockTask extends Task {

        constructor() {
            super()
            this.partialName = partialName
            this.count = count
        }

        onStart() {
            this.initialCount = bot.inventory.getCount(partialName)
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
            const e = Object.values(bot.entities).filter(e => e.getDroppedItem()?.displayName.includes(partialName))[0]
            if (e) {
                if (!(bot.pathfinder.goal instanceof goals.GoalFollow) || bot.pathfinder.goal.entity != e) {
                    bot.pathfinder.setGoal(new goals.GoalFollow(e, 0))
                }
                return null
            }

            const p = bot.findBlocks({matching:block=>block.displayName.includes(partialName)})[0]
            if (bot.entity.position.offset(0, 1.6, 0).distanceTo(p) < 3 && !bot.targetDigBlock) {
                const b = bot.blockAt(p)
                this.equipBestTool(b, () => bot.dig(b, true).catch(e => {}))
                
                
                return null
            }
            
            if (!(bot.pathfinder.goal instanceof goals.GoalLookAtBlock) || bot.pathfinder.goal.pos.distanceTo(p) > 1) {
                bot.pathfinder.setGoal(new goals.GoalLookAtBlock(p, bot.world, {reach:2}))
            }
            return null
        };

        isFinished() {
            return bot.inventory.getCount(partialName) >= this.initialCount + count
        }

        // interruptTask = null if the task stopped cleanly
        onStop(interruptTask) {
            bot.pathfinder.stop()
            bot.stopDigging()
        };

        isEqual(other) {return other instanceof DigBlockTask && other.partialName == partialName && other.count == count};

        toDebugString() {return "DigBlockTask"};
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
                this.sub.stop(mod);
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
        

        if (this.sub != null && !this.sub.stopped()) {
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

        if (this.sub != null && !this.sub.stopped()) {
            this.sub.interrupt(interruptTask);
        }

        this.first = true;
    }

    toString() {
        return this.constructor.name;
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