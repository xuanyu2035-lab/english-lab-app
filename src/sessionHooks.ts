/** Tiny bridge so practice screens can cooperate with a running lesson (session) without circular imports. */
export const hooks = {
  active: false,
  immersive: false,
  /** true when the current segment's time budget is used up */
  timeUp: (): boolean => false,
  /** leave the current activity and move on (next activity / rest / summary) */
  advance: (): void => undefined,
  /** end the whole lesson now (asks first) */
  quit: (): void => undefined,
  /** "mm:ss" left in the current segment */
  remaining: (): string => '',
};
