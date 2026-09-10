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

export function swingTime(o) {
    if (o == null) return 5
    const {displayName} = o
    if (displayName.includes("Sword")) return 12
    if (displayName.includes("Axe")) return 20
    return 5
}