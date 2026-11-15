const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

export function numberWord(n: number): string {
  return WORDS[n] ?? String(n)
}

export function boxesLeft(n: number): string {
  return `${n} ${n === 1 ? 'box' : 'boxes'} left today`
}
