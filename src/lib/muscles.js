/**
 * Which muscles an exercise trains. Pure: no DOM, no database.
 *
 * An exercise is known when it is in the person's own mapping or in the seed
 * table, matched on its whole normalised name. Nothing is matched on part of a
 * name, so an exercise that is not listed is asked about rather than guessed.
 */

export const MUSCLE_LABELS = {
  chest: 'Chest',
  frontDelts: 'Front delts',
  sideDelts: 'Side delts',
  rearDelts: 'Rear delts',
  lats: 'Lats',
  traps: 'Traps',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
}
export const MUSCLE_GROUPS = Object.keys(MUSCLE_LABELS)

/** `Dumbbell Bench-Press ` and `dumbbell bench press` are one exercise. */
export function exerciseKey(name) {
  const raw = String(name).toLowerCase()
  return raw.replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() || raw.trim()
}

/* ---------------------------------------------------------------- the seed */

/**
 * One line per movement: names split by `|`, the equipment words that can come
 * in front of them, primary muscles, secondary muscles. An `-` in the equipment
 * list is the bare name.
 */
const FREE = 'dumbbell barbell smith-machine kettlebell'
const ANY = `${FREE} cable machine -`
const SEED_LINES = `
bench press|chest press|seated chest press|flat bench press|${ANY} seated|chest|frontDelts triceps
incline bench press|incline chest press|incline press|${ANY}|chest|frontDelts triceps
decline bench press|decline chest press|${ANY}|chest|triceps frontDelts
close grip bench press|${FREE} -|triceps|chest frontDelts
floor press|${FREE} -|chest|triceps frontDelts
fly|flye|chest fly|chest flye|flat fly|flat chest fly|${ANY}|chest|frontDelts
incline fly|incline flye|incline chest fly|${ANY}|chest|frontDelts
decline fly|low to high fly|high to low fly|fly low|fly mid|fly high|${ANY}|chest|frontDelts
crossover|cable crossover|cable -|chest|frontDelts
pec deck|pec deck fly|machine -|chest|frontDelts
push up|pushup|push ups|pushups|incline push up|decline push up|weighted bodyweight -|chest|frontDelts triceps
close grip push up|diamond push up|bodyweight -|triceps|chest frontDelts
dip|dips|chest dip|weighted bodyweight machine assisted -|chest triceps|frontDelts
triceps dip|tricep dip|bench dip|triceps dips|tricep dips|bench dips|weighted bodyweight machine assisted -|triceps|chest frontDelts
shoulder press|overhead press|military press|seated shoulder press|standing shoulder press|seated overhead press|${ANY}|frontDelts|sideDelts triceps
push press|${FREE} -|frontDelts|sideDelts triceps quads
arnold press|seated arnold press|dumbbell kettlebell -|frontDelts|sideDelts triceps
lateral raise|side lateral raise|side raise|seated lateral raise|${ANY}|sideDelts|
leaning lateral raise|single arm lateral raise|one arm lateral raise|dumbbell cable -|sideDelts|
upright row|${ANY}|sideDelts traps|frontDelts biceps
front raise|${ANY} plate|frontDelts|sideDelts
rear delt fly|rear delt flye|rear delt reverse fly|reverse fly|reverse flye|bent over reverse fly|bent over rear delt fly|rear delt raise|rear lateral raise|${ANY}|rearDelts|traps
reverse pec deck|machine -|rearDelts|traps
face pull|cable band -|rearDelts|traps
rear delt row|${ANY}|rearDelts|lats traps
pull up|pullup|pull ups|pullups|wide grip pull up|weighted bodyweight assisted machine -|lats|biceps
chin up|chinup|chin ups|chinups|neutral grip pull up|hammer grip pull up|weighted bodyweight assisted machine -|lats biceps|
lat pulldown|pulldown|wide grip lat pulldown|wide grip pulldown|neutral grip lat pulldown|cable machine -|lats|biceps
lat pull down|wide grip lat pull down|lat pull down wide grip|lat pull down close grip|lat pull down single arm|lat pull down v grip|lat pull down v grip narrow hammer|cable machine -|lats|biceps
close grip lat pulldown|reverse grip lat pulldown|underhand lat pulldown|cable machine -|lats|biceps
straight arm pulldown|straight arm pull down|straight arm lat pulldown|cable cable-bar cable-rope band -|lats|triceps
pullover|${ANY}|lats|chest triceps
row|bent over row|seated row|v handle seated row|${ANY}|lats|traps rearDelts biceps
pendlay row|yates row|barbell -|lats|traps rearDelts biceps
t bar row|barbell machine -|lats|traps rearDelts biceps
single arm row|one arm row|single arm bent over row|dumbbell kettlebell cable machine -|lats|traps rearDelts biceps
chest supported row|incline row|incline bench row|${ANY}|lats|traps rearDelts biceps
renegade row|dumbbell kettlebell -|lats|abs biceps
inverted row|bodyweight -|lats|traps rearDelts biceps
low row|high row|cable machine -|lats|traps rearDelts biceps
shrug|shrugs|${ANY} trap-bar|traps|forearms
curl|biceps curl|bicep curl|standing curl|standing biceps curl|seated curl|seated biceps curl|alternating biceps curl|alternating curl|incline curl|incline biceps curl|incline bicep curl|rope bicep curl|rope biceps curl|close grip bicep curl|close grip biceps curl|${ANY} ez-bar|biceps|forearms
hammer curl|incline hammer curl|seated hammer curl|standing hammer curl|alternating hammer curl|cross body hammer curl|rope hammer curl|dumbbell cable kettlebell -|biceps|forearms
preacher curl|concentration curl|spider curl|drag curl|bayesian curl|${ANY} ez-bar|biceps|forearms
reverse curl|reverse grip bicep curl|reverse grip biceps curl|${ANY} ez-bar|forearms|biceps
zottman curl|zottman curls|dumbbell -|biceps forearms|
wrist curl|reverse wrist curl|forearm curl|reverse grip forearm curl|${ANY}|forearms|
farmers carry|farmers walk|farmer carry|farmer walk|dumbbell kettlebell trap-bar -|forearms|traps
triceps extension|tricep extension|overhead triceps extension|overhead tricep extension|overhead extension|lying triceps extension|lying tricep extension|seated triceps extension|single arm triceps extension|single arm overhead tricep extension|single arm overhead tricep extension low|single arm overhead tricep extension high|rope overhead tricep extension|rope overhead tricep extension low|rope overhead tricep extension high|single dumbbell overhead tricep extension|${ANY} ez-bar|triceps|
skull crusher|skullcrusher|skull crushers|skullcrushers|${FREE} ez-bar cable -|triceps|
triceps pushdown|tricep pushdown|pushdown|rope pushdown|triceps rope pushdown|rope triceps pushdown|rope tricep pushdown|rope tricep pushdown extension|cable machine band -|triceps|
triceps kickback|tricep kickback|dumbbell cable -|triceps|
sumo squat|${FREE} bodyweight -|quads glutes|hamstrings
squat|back squat|${FREE} machine bodyweight -|quads|glutes hamstrings
front squat|goblet squat|zercher squat|${FREE} -|quads|glutes
hack squat|pendulum squat|belt squat|machine barbell -|quads|glutes
bulgarian split squat|split squat|${FREE} bodyweight -|quads glutes|hamstrings
lunge|lunges|walking lunge|walking lunges|reverse lunge|forward lunge|curtsy lunge|${FREE} bodyweight -|quads glutes|hamstrings
side lunge|lateral lunge|cossack squat|dumbbell kettlebell bodyweight barbell -|quads glutes|hamstrings
step up|step ups|${FREE} bodyweight -|quads glutes|hamstrings
leg press|single leg press|machine sled -|quads|glutes hamstrings
leg extension|leg extensions|single leg extension|machine cable -|quads|
sissy squat|wall sit|bodyweight machine -|quads|
deadlift|conventional deadlift|${FREE} trap-bar -|hamstrings glutes|traps lats quads forearms
sumo deadlift|${FREE} -|glutes hamstrings|quads traps forearms
romanian deadlift|rdl|stiff leg deadlift|stiff legged deadlift|straight leg deadlift|single leg romanian deadlift|${FREE} cable -|hamstrings|glutes forearms
good morning|good mornings|barbell dumbbell bodyweight smith-machine -|hamstrings|glutes
leg curl|lying leg curl|seated leg curl|standing leg curl|hamstring curl|leg hamstring curl seated|leg hamstring curl lying|machine cable dumbbell -|hamstrings|calves
nordic curl|nordic hamstring curl|bodyweight assisted -|hamstrings|
hip thrust|glute bridge|hip thrust glute bridge|single leg glute bridge|single leg hip thrust|${FREE} machine bodyweight -|glutes|hamstrings
glute kickback|hip extension|cable machine bodyweight band -|glutes|hamstrings
hip abduction|cable machine bodyweight band -|glutes|
pull through|cable -|glutes hamstrings|
back extension|hyperextension|machine weighted bodyweight -|glutes hamstrings|
kettlebell swing|dumbbell swing|-|glutes hamstrings|
calf raise|standing calf raise|seated calf raise|single leg calf raise|${ANY} bodyweight|calves|
calf press|leg press calf raise|machine -|calves|
crunch|crunches|sit up|sit ups|decline crunch|decline sit up|reverse crunch|kneeling crunch|double crunch|weighted cable machine bodyweight dumbbell -|abs|
hanging leg raise|leg raise|lying leg raise|hanging knee raise|knee raise|captains chair leg raise|weighted bodyweight -|abs|obliques
v up|v ups|in and out|toe touch|dead bug|hollow hold|hollow body hold|ab wheel rollout|ab rollout|ab wheel|weighted bodyweight -|abs|
plank|front plank|mountain climber|mountain climbers|weighted bodyweight -|abs|obliques
bicycle crunch|bicycle crunches|bodyweight -|abs obliques|
heel tap|heel taps|bodyweight -|obliques|abs
russian twist|woodchopper|wood chop|woodchop|oblique crunch|side bend|side plank|dumbbell cable kettlebell weighted bodyweight -|obliques|abs
`

function buildSeed() {
  const seed = new Map()
  for (const line of SEED_LINES.trim().split('\n')) {
    const cells = line.split('|')
    const [equipment, primary, secondary] = cells.splice(-3)
    const words = (cell) => cell.split(' ').filter(Boolean)
    const entry = { primary: words(primary), secondary: words(secondary) }
    for (const name of cells) {
      for (const eq of words(equipment)) {
        seed.set(exerciseKey(eq === '-' ? name : `${eq} ${name}`), entry)
      }
    }
  }
  return seed
}
export const SEED = buildSeed()

/**
 * The person's own answer, then the seed, then null for an unknown exercise.
 * Motra's own groups, where an import carried them, are behind both; see
 * `musclesOf`.
 */
export function musclesFor(name, mappings = {}) {
  const key = exerciseKey(name)
  if (mappings && Object.hasOwn(mappings, key)) return mappings[key]
  return SEED.get(key) ?? null
}

/** The same for one stored exercise, which may carry Motra's groups. */
export function musclesOf(ex, mappings) {
  const known = musclesFor(ex.name, mappings)
  if (known || !ex.motraMuscles?.length) return known
  return { primary: ex.motraMuscles, secondary: [] }
}

/** Each unknown exercise once, named as it was first written. */
export function unknownExercises(exercises, mappings) {
  const seen = new Map()
  for (const ex of exercises) {
    const key = exerciseKey(ex.name)
    if (!seen.has(key) && !musclesOf(ex, mappings)) seen.set(key, ex.name)
  }
  return [...seen.values()]
}

/** `Chest. Secondary: Front delts, triceps`, or what there is of it. */
export function musclesLabel(m) {
  if (!m) return 'Muscles not chosen yet'
  const list = (groups) =>
    groups.map((g, i) => (i ? MUSCLE_LABELS[g].toLowerCase() : MUSCLE_LABELS[g])).join(', ')
  if (!m.primary.length && !m.secondary.length) return 'No muscles counted'
  if (!m.primary.length) return `Secondary: ${list(m.secondary).toLowerCase()}`
  return m.secondary.length
    ? `${list(m.primary)}. Secondary: ${list(m.secondary).toLowerCase()}`
    : list(m.primary)
}

/** The short form beside a set count: the primaries, or why there are none. */
export function primaryLabel(m) {
  if (!m) return 'Muscles not chosen yet'
  if (m.primary.length) {
    return m.primary.map((g, i) => (i ? MUSCLE_LABELS[g].toLowerCase() : MUSCLE_LABELS[g])).join(', ')
  }
  return m.secondary.length ? null : 'No muscles counted'
}
