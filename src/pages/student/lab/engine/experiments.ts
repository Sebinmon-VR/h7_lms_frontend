import { pH, type Vessel, type VesselKind } from './sim'

/**
 * Guided experiments: an aim, the kit, steps the bench checks as the student
 * works, and a short quiz. The built-in library below is what teachers assign
 * or start from; a teacher's own experiment uses the same shape.
 */

export type EquipmentKind =
  | VesselKind
  | 'burner' | 'thermometer' | 'splint' | 'dropper' | 'tongs' | 'loop' | 'litmus' | 'delivery' | 'spatula'

/** Something the student did on the bench. */
export type LabAction =
  | { type: 'place'; equipment: EquipmentKind; id: string }
  | { type: 'add'; reagent: string; vesselId: string; vessel: VesselKind; amount: number }
  | { type: 'transfer'; from: string; to: string }
  | { type: 'heat'; vesselId: string; on: boolean }
  | { type: 'connect'; from: string; to: string }
  | { type: 'test'; test: TestKind; vesselId: string; result: string }
  | { type: 'stir'; vesselId: string }

export type TestKind = 'splint-glowing' | 'splint-burning' | 'litmus-red' | 'litmus-blue' | 'flame' | 'thermometer'

export type StepCheck =
  | { type: 'place'; equipment: EquipmentKind }
  | { type: 'add'; reagent: string; into?: VesselKind }
  | { type: 'heat' }
  | { type: 'connect' }
  | { type: 'test'; test: TestKind; result?: string }
  /** A reaction (sim id) has been seen in some vessel. */
  | { type: 'reaction'; reaction: string }
  | { type: 'temp'; above?: number; below?: number }
  | { type: 'ph'; above?: number; below?: number }

export interface ExperimentStep {
  text: string
  hint?: string
  check: StepCheck
}

export interface QuizQuestion {
  q: string
  options: string[]
  /** Index of the right option. */
  answer: number
  explain?: string
}

export interface Experiment {
  id: string
  title: string
  topic: string
  /** Rough school grade range, for the teacher's picker. */
  grades: string
  minutes: number
  emoji: string
  aim: string
  theory: string
  equipment: EquipmentKind[]
  /** Reagent ids from the cabinet that this experiment needs; others stay available in free mode. */
  reagents: string[]
  safety: string[]
  steps: ExperimentStep[]
  questions: QuizQuestion[]
}

/** Is this step satisfied by the latest action or by the state of the bench? */
export function stepDone(step: ExperimentStep, action: LabAction | null, vessels: Vessel[]): boolean {
  const c = step.check
  switch (c.type) {
    case 'place':
      return action?.type === 'place' && action.equipment === c.equipment
    case 'add':
      return action?.type === 'add' && action.reagent === c.reagent && (!c.into || action.vessel === c.into)
    case 'heat':
      return action?.type === 'heat' && action.on
    case 'connect':
      return action?.type === 'connect'
    case 'test':
      return action?.type === 'test' && action.test === c.test && (!c.result || action.result === c.result)
    case 'reaction':
      return vessels.some((v) => v.seen.includes(c.reaction))
    case 'temp':
      return vessels.some((v) => (c.above == null || v.temp > c.above) && (c.below == null || v.temp < c.below) && Object.keys(v.contents).length > 0)
    case 'ph':
      return vessels.some((v) => {
        const p = pH(v)
        return p != null && (c.above == null || p > c.above) && (c.below == null || p < c.below)
      })
  }
}

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'neutralisation',
    title: 'Neutralising an acid',
    topic: 'Acids, bases and salts',
    grades: '7–10',
    minutes: 10,
    emoji: '🧪',
    aim: 'Neutralise hydrochloric acid with sodium hydroxide, watching universal indicator change colour.',
    theory: 'An acid and an alkali react to form a salt and water: H⁺ + OH⁻ → H₂O. Universal indicator shows the pH — red for strong acid, green for neutral, purple for strong alkali.',
    equipment: ['beaker', 'dropper', 'thermometer'],
    reagents: ['r_hcl', 'r_naoh', 'r_univ'],
    safety: ['Hydrochloric acid and sodium hydroxide are corrosive — wear goggles.'],
    steps: [
      { text: 'Put a beaker on the bench.', check: { type: 'place', equipment: 'beaker' } },
      { text: 'Add about 20 mL of hydrochloric acid to the beaker.', check: { type: 'add', reagent: 'r_hcl', into: 'beaker' } },
      { text: 'Add a few drops of universal indicator. What colour is it?', check: { type: 'add', reagent: 'r_univ' } },
      { text: 'Add sodium hydroxide a little at a time until the indicator turns green.', hint: 'Watch the pH meter on the beaker. Add small amounts near the end.', check: { type: 'ph', above: 6.5, below: 7.5 } },
      { text: 'Measure the temperature with the thermometer.', check: { type: 'test', test: 'thermometer' } },
    ],
    questions: [
      { q: 'What colour was universal indicator in the acid?', options: ['Red', 'Green', 'Purple', 'Blue'], answer: 0 },
      { q: 'What are the products of neutralisation?', options: ['Salt and water', 'Hydrogen gas', 'Carbon dioxide', 'Oxygen'], answer: 0 },
      { q: 'The temperature went up. This reaction is…', options: ['Exothermic', 'Endothermic', 'Neither'], answer: 0, explain: 'Neutralisation releases heat.' },
    ],
  },
  {
    id: 'hydrogen',
    title: 'Metals and acids: the hydrogen pop',
    topic: 'Metals',
    grades: '7–10',
    minutes: 8,
    emoji: '💥',
    aim: 'React magnesium with hydrochloric acid and identify the gas with a burning splint.',
    theory: 'Reactive metals react with acids to give a salt and hydrogen: Mg + 2HCl → MgCl₂ + H₂. Hydrogen burns with a squeaky pop.',
    equipment: ['testtube', 'splint'],
    reagents: ['r_hcl', 'r_mg', 'r_zn', 'r_cu'],
    safety: ['Keep the burning splint away from your face.'],
    steps: [
      { text: 'Put a test tube on the bench.', check: { type: 'place', equipment: 'testtube' } },
      { text: 'Add about 10 mL of hydrochloric acid.', check: { type: 'add', reagent: 'r_hcl', into: 'testtube' } },
      { text: 'Drop in a piece of magnesium ribbon. What do you see?', check: { type: 'reaction', reaction: 'mg_acid' } },
      { text: 'Hold a burning splint at the mouth of the tube.', check: { type: 'test', test: 'splint-burning', result: 'pop' } },
    ],
    questions: [
      { q: 'Which gas made the pop?', options: ['Hydrogen', 'Oxygen', 'Carbon dioxide', 'Chlorine'], answer: 0 },
      { q: 'Which metal would NOT fizz in dilute acid?', options: ['Copper', 'Zinc', 'Magnesium', 'Iron'], answer: 0, explain: 'Copper is below hydrogen in the reactivity series.' },
    ],
  },
  {
    id: 'co2_limewater',
    title: 'Carbon dioxide and limewater',
    topic: 'Gases',
    grades: '7–10',
    minutes: 12,
    emoji: '🫧',
    aim: 'Make carbon dioxide from marble chips and acid, and prove it with limewater.',
    theory: 'Carbonates react with acids to give carbon dioxide: CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂. CO₂ turns limewater milky by forming insoluble calcium carbonate.',
    equipment: ['flask', 'testtube', 'delivery', 'splint'],
    reagents: ['r_hcl', 'r_caco3', 'r_lime'],
    safety: ['Wear goggles; the acid is corrosive.'],
    steps: [
      { text: 'Put a conical flask on the bench and add some marble chips.', check: { type: 'add', reagent: 'r_caco3', into: 'flask' } },
      { text: 'Put a test tube on the bench and half-fill it with limewater.', check: { type: 'add', reagent: 'r_lime', into: 'testtube' } },
      { text: 'Connect the flask to the limewater with the delivery tube.', check: { type: 'connect' } },
      { text: 'Pour hydrochloric acid onto the marble chips.', check: { type: 'add', reagent: 'r_hcl', into: 'flask' } },
      { text: 'Watch the limewater.', check: { type: 'reaction', reaction: 'limewater' } },
    ],
    questions: [
      { q: 'What happened to the limewater?', options: ['It turned milky', 'It turned blue', 'Nothing', 'It boiled'], answer: 0 },
      { q: 'Which substance makes limewater milky?', options: ['Calcium carbonate', 'Calcium chloride', 'Sodium chloride', 'Water'], answer: 0 },
    ],
  },
  {
    id: 'oxygen_catalyst',
    title: 'A catalyst and oxygen',
    topic: 'Rates of reaction',
    grades: '8–10',
    minutes: 8,
    emoji: '✨',
    aim: 'Decompose hydrogen peroxide with manganese(IV) oxide and test the gas with a glowing splint.',
    theory: '2H₂O₂ → 2H₂O + O₂. Manganese(IV) oxide speeds this up without being used up — it is a catalyst. Oxygen relights a glowing splint.',
    equipment: ['flask', 'spatula', 'splint'],
    reagents: ['r_h2o2', 'r_mno2'],
    safety: ['Hydrogen peroxide is an oxidiser — avoid skin contact.'],
    steps: [
      { text: 'Put a conical flask on the bench and add 20 mL of hydrogen peroxide.', check: { type: 'add', reagent: 'r_h2o2', into: 'flask' } },
      { text: 'Add a spatula of manganese(IV) oxide.', check: { type: 'reaction', reaction: 'h2o2_mno2' } },
      { text: 'Hold a glowing splint at the mouth of the flask.', check: { type: 'test', test: 'splint-glowing', result: 'relights' } },
    ],
    questions: [
      { q: 'What did the glowing splint do?', options: ['Relit', 'Went out', 'Popped', 'Nothing'], answer: 0 },
      { q: 'Why is MnO₂ called a catalyst?', options: ['It speeds up the reaction and is not used up', 'It makes oxygen', 'It is black', 'It dissolves'], answer: 0 },
    ],
  },
  {
    id: 'precipitates',
    title: 'Testing for ions with precipitates',
    topic: 'Chemical analysis',
    grades: '9–10',
    minutes: 12,
    emoji: '🔬',
    aim: 'Identify chloride, sulfate and iodide ions from the colour of their precipitates.',
    theory: 'Silver nitrate gives a white precipitate with chloride ions, and barium chloride gives a white precipitate with sulfate ions. Lead(II) nitrate and potassium iodide make bright yellow lead(II) iodide.',
    equipment: ['testtube', 'dropper'],
    reagents: ['r_agno3', 'r_nacl', 'r_bacl2', 'r_na2so4', 'r_pbno32', 'r_ki'],
    safety: ['Lead and barium compounds are toxic — wash your hands afterwards.'],
    steps: [
      { text: 'In a test tube, add sodium chloride solution, then a few drops of silver nitrate.', check: { type: 'reaction', reaction: 'agcl' } },
      { text: 'In another test tube, add sodium sulfate solution, then barium chloride.', check: { type: 'reaction', reaction: 'baso4' } },
      { text: 'In a third test tube, mix lead(II) nitrate with potassium iodide.', check: { type: 'reaction', reaction: 'pbi2' } },
    ],
    questions: [
      { q: 'Silver nitrate gives a white precipitate with…', options: ['Chloride ions', 'Sulfate ions', 'Sodium ions', 'Nitrate ions'], answer: 0 },
      { q: 'What colour is lead(II) iodide?', options: ['Bright yellow', 'White', 'Blue', 'Black'], answer: 0 },
    ],
  },
  {
    id: 'displacement',
    title: 'Displacement: iron in copper sulfate',
    topic: 'Reactivity series',
    grades: '8–10',
    minutes: 10,
    emoji: '🔩',
    aim: 'Show that iron is more reactive than copper by displacing it from copper(II) sulfate.',
    theory: 'Fe + CuSO₄ → FeSO₄ + Cu. The blue colour (copper ions) fades to pale green (iron(II) ions) and copper coats the iron.',
    equipment: ['testtube'],
    reagents: ['r_cuso4', 'r_fe', 'r_zn', 'r_mg'],
    safety: ['Copper sulfate is harmful if swallowed.'],
    steps: [
      { text: 'Add copper(II) sulfate solution to a test tube.', check: { type: 'add', reagent: 'r_cuso4', into: 'testtube' } },
      { text: 'Add iron filings and watch closely.', check: { type: 'reaction', reaction: 'fe_cu' } },
    ],
    questions: [
      { q: 'What coats the iron?', options: ['Copper', 'Rust', 'Sulfur', 'Salt'], answer: 0 },
      { q: 'This shows iron is ___ reactive than copper.', options: ['More', 'Less', 'Equally'], answer: 0 },
    ],
  },
  {
    id: 'flame_tests',
    title: 'Flame tests',
    topic: 'Chemical analysis',
    grades: '9–10',
    minutes: 10,
    emoji: '🔥',
    aim: 'Identify metal ions from the colour they turn a Bunsen flame.',
    theory: 'Heating metal ions makes their electrons give out light of particular colours: lithium crimson, sodium yellow, potassium lilac, calcium orange-red, copper blue-green.',
    equipment: ['testtube', 'burner', 'loop'],
    reagents: ['r_licl', 'r_nacl', 'r_kcl', 'r_cacl2', 'r_cuso4', 'r_srcl2', 'r_bacl2'],
    safety: ['Keep hair and sleeves away from the flame.'],
    steps: [
      { text: 'Put the Bunsen burner on the bench and light it.', check: { type: 'place', equipment: 'burner' } },
      { text: 'Pour some lithium chloride solution into a test tube.', check: { type: 'add', reagent: 'r_licl' } },
      { text: 'Dip the loop in it and hold it in the flame.', check: { type: 'test', test: 'flame' } },
      { text: 'Try sodium chloride and copper sulfate too.', check: { type: 'add', reagent: 'r_nacl' } },
    ],
    questions: [
      { q: 'Lithium ions give a ___ flame.', options: ['Crimson', 'Yellow', 'Lilac', 'Green'], answer: 0 },
      { q: 'Sodium ions give a ___ flame.', options: ['Yellow', 'Blue-green', 'Lilac', 'Red'], answer: 0 },
    ],
  },
  {
    id: 'energy_changes',
    title: 'Hot and cold dissolving',
    topic: 'Energy changes',
    grades: '8–10',
    minutes: 10,
    emoji: '🌡️',
    aim: 'Measure the temperature change when sodium hydroxide and ammonium chloride dissolve.',
    theory: 'Exothermic changes give out heat (the temperature rises); endothermic changes take heat in (the temperature falls).',
    equipment: ['beaker', 'thermometer', 'spatula'],
    reagents: ['r_water', 'r_naohs', 'r_nh4cls'],
    safety: ['Sodium hydroxide pellets are corrosive.'],
    steps: [
      { text: 'Pour 50 mL of water into a beaker and measure its temperature.', check: { type: 'test', test: 'thermometer' } },
      { text: 'Add sodium hydroxide pellets and watch the thermometer.', check: { type: 'temp', above: 27 } },
      { text: 'In a fresh beaker of water, dissolve ammonium chloride.', check: { type: 'temp', below: 18 } },
    ],
    questions: [
      { q: 'Dissolving sodium hydroxide is…', options: ['Exothermic', 'Endothermic'], answer: 0 },
      { q: 'Dissolving ammonium chloride is…', options: ['Endothermic', 'Exothermic'], answer: 0 },
    ],
  },
  {
    id: 'starch',
    title: 'Testing for starch',
    topic: 'Food tests',
    grades: '6–9',
    minutes: 5,
    emoji: '🍞',
    aim: 'Use iodine solution to test for starch.',
    theory: 'Iodine solution is orange-brown. With starch it turns blue-black.',
    equipment: ['testtube', 'dropper'],
    reagents: ['r_starch', 'r_iodine', 'r_sugar', 'r_water'],
    safety: ['Iodine stains skin and clothes.'],
    steps: [
      { text: 'Put starch solution in a test tube.', check: { type: 'add', reagent: 'r_starch' } },
      { text: 'Add a few drops of iodine solution.', check: { type: 'reaction', reaction: 'starch_iodine' } },
    ],
    questions: [{ q: 'Iodine turns ___ with starch.', options: ['Blue-black', 'Red', 'Milky', 'Colourless'], answer: 0 }],
  },
  {
    id: 'thermal_decomposition',
    title: 'Heating copper carbonate',
    topic: 'Types of reaction',
    grades: '8–10',
    minutes: 10,
    emoji: '♨️',
    aim: 'Heat copper(II) carbonate and test the gas given off with limewater.',
    theory: 'CuCO₃ → CuO + CO₂. The green powder turns black copper(II) oxide; carbon dioxide turns limewater milky.',
    equipment: ['boilingtube', 'testtube', 'burner', 'delivery'],
    reagents: ['r_cuco3', 'r_lime'],
    safety: ['Remove the delivery tube from the limewater before you stop heating, or limewater sucks back.'],
    steps: [
      { text: 'Put copper(II) carbonate into a boiling tube.', check: { type: 'add', reagent: 'r_cuco3', into: 'boilingtube' } },
      { text: 'Half-fill a test tube with limewater and connect the delivery tube.', check: { type: 'connect' } },
      { text: 'Heat the boiling tube over the Bunsen burner.', check: { type: 'heat' } },
      { text: 'Watch both tubes.', check: { type: 'reaction', reaction: 'cuco3_heat' } },
    ],
    questions: [
      { q: 'What colour did the powder turn?', options: ['Black', 'Blue', 'White', 'Red'], answer: 0 },
      { q: 'This is a ___ reaction.', options: ['Thermal decomposition', 'Neutralisation', 'Displacement'], answer: 0 },
    ],
  },
  {
    id: 'elephant',
    title: 'Elephant toothpaste',
    topic: 'Catalysts',
    grades: '6–10',
    minutes: 5,
    emoji: '🐘',
    aim: 'Make a giant column of foam by decomposing hydrogen peroxide with a catalyst and soap.',
    theory: 'The catalyst rapidly breaks hydrogen peroxide into water and oxygen; washing-up liquid traps the oxygen as foam.',
    equipment: ['cylinder'],
    reagents: ['r_h2o2', 'r_soap', 'r_ki'],
    safety: ['The foam is warm. Stand back.'],
    steps: [
      { text: 'Pour hydrogen peroxide into the measuring cylinder.', check: { type: 'add', reagent: 'r_h2o2', into: 'cylinder' } },
      { text: 'Add a squirt of washing-up liquid.', check: { type: 'add', reagent: 'r_soap' } },
      { text: 'Add potassium iodide and stand back!', check: { type: 'reaction', reaction: 'h2o2_foam' } },
    ],
    questions: [{ q: 'What gas fills the foam?', options: ['Oxygen', 'Hydrogen', 'Carbon dioxide'], answer: 0 }],
  },
  {
    id: 'water_test',
    title: 'Testing for water',
    topic: 'Chemical tests',
    grades: '7–10',
    minutes: 5,
    emoji: '💧',
    aim: 'Use anhydrous copper(II) sulfate to test for water.',
    theory: 'White anhydrous copper(II) sulfate turns blue when water is added, and the change gives out heat.',
    equipment: ['dish', 'dropper'],
    reagents: ['r_cuso4a', 'r_water'],
    safety: ['Copper sulfate is harmful if swallowed.'],
    steps: [
      { text: 'Put anhydrous copper(II) sulfate in an evaporating dish.', check: { type: 'add', reagent: 'r_cuso4a', into: 'dish' } },
      { text: 'Add a few drops of water.', check: { type: 'reaction', reaction: 'cuso4_anh_water' } },
    ],
    questions: [{ q: 'What colour change shows water is present?', options: ['White to blue', 'Blue to white', 'Green to black'], answer: 0 }],
  },
]

export const EXPERIMENT_BY_ID: Record<string, Experiment> = Object.fromEntries(EXPERIMENTS.map((e) => [e.id, e]))

/**
 * A teacher's own experiment, as stored with an assignment, made runnable:
 * missing fields get safe defaults and it is registered under `id`.
 */
export function registerExperiment(id: string, raw: Record<string, unknown>): Experiment {
  const e = raw as Partial<Experiment>
  const experiment: Experiment = {
    id,
    title: String(e.title ?? 'Experiment'),
    topic: String(e.topic ?? 'Set by your teacher'),
    grades: String(e.grades ?? ''),
    minutes: Number(e.minutes ?? 10),
    emoji: String(e.emoji ?? '🧪'),
    aim: String(e.aim ?? ''),
    theory: String(e.theory ?? ''),
    equipment: Array.isArray(e.equipment) ? e.equipment : [],
    reagents: Array.isArray(e.reagents) ? e.reagents : [],
    safety: Array.isArray(e.safety) ? e.safety : [],
    steps: Array.isArray(e.steps) ? e.steps : [],
    questions: Array.isArray(e.questions) ? e.questions : [],
  }
  EXPERIMENT_BY_ID[id] = experiment
  return experiment
}
