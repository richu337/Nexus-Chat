export function sortedPairKey(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

export function getConversationId(userA: string, userB: string): string {
  return sortedPairKey(userA, userB)
}

export function getFriendshipId(userA: string, userB: string): string {
  return sortedPairKey(userA, userB)
}

export function getBlockId(blockerId: string, blockedId: string): string {
  return `${blockerId}_${blockedId}`
}

export function getFriendRequestId(senderId: string, receiverId: string): string {
  return `${senderId}_${receiverId}`
}

export function otherMember(members: string[], me: string): string | undefined {
  return members.find((m) => m !== me)
}

export function isMember(members: string[], uid: string): boolean {
  return members.includes(uid)
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function truncate(text: string, max = 60): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}
