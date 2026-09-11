export function timeout(t) {
    return new Promise(res => {
        setTimeout(res, t)
    })
}

export function itemTier(o) {
    if (o == null) return 0
    const {displayName} = o
    if (displayName.includes("Netherite")) return 5
    if (displayName.includes("Diamond")) return 4
    if (displayName.includes("Iron")) return 3
    if (displayName.includes("Stone")) return 2
    if (displayName.includes("Gold") || displayName.includes("Wood")) return 1
    return 0
}

export function isDirt(item) {
    return item && item.displayName == "Grass Block" || item.displayName == "Dirt"
}

export function isLog(item) {
    return item && item.displayName.includes("Log")
}

export function isStone(item) {
    return item && (item.displayName.includes("Cobble") || item.displayName.includes("Stone"))
}

export function isCreeperExploding(entity) {
    return entity && entity.displayName == "Creeper" && entity.metadata[16]
}

export function shouldHunt(entity) {
    if (!entity) return false
    switch(entity.displayName) {
        case "Pig":
        case "Cow":
        case "Chicken":
        case "Sheep":
        case "Cod":
        case "Salmon":
            return true
    }
    return false
}

export function isGoodRawFood(item) {
    if (!item) return false
    switch(item.displayName) {
        case "Raw Beef":
        case "Raw Chicken":
        case "Raw Cod":
        case "Raw Mutton":
        case "Raw Porkchop":
        case "Raw Salmon":
            return true
    }
    return false
}

export function isGoodCookedFood(item) {
    if (!item) return false
    switch(item.displayName) {
        case "Steak":
        case "Cooked Chicken":
        case "Cooked Cod":
        case "Cooked Mutton":
        case "Cooked Porkchop":
        case "Cooked Salmon":
            return true
    }
    return false
}

export function swingTime(o) {
    if (o == null) return 5
    const {displayName} = o
    if (displayName.includes("Sword")) return 12
    if (displayName.includes("Axe")) return 20
    return 5
}