#!/usr/bin/env node
// ─── Umbrella store covers (roadmap #Cover-1) ───────────────────────────────
//
//   node scripts/art/umbrella-covers.mjs jobs <scenes|masters|logos> [--style lantern|clay]
//       writes art-sheets/promotion-umbrella/jobs-<kind>.json for the Gemini runner
//   node scripts/art/umbrella-covers.mjs cut
//       cuts every deliverable from the chosen masters into src/assets/promotion/<style>/
//
// Four cover SCENES per art style are painted at 16:9 and compared; the chosen scene is then
// painted as a square and a portrait master too, and every size is cut from the master of its own
// shape. A logo wordmark per style is painted on magenta, keyed, and placed bottom-right on the
// "-logo" variants (CrazyGames lays its banners over the top left, up to the middle).
//
// The prompts follow the cover rules of the art pipeline: no text or UI in the art itself, the
// game's own characters (attached as one figure each), one clear focal point, high contrast,
// readable as a thumbnail.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(ROOT, 'art-sheets', 'promotion-umbrella')
const OUT = join(ROOT, 'src', 'assets', 'promotion')

const STYLES = {
  lantern: {
    sheets: join(ROOT, 'art-sheets', 'umbrella-lantern'),
    concept: 'style/lantern-key.png',
    finish: 'a lantern-festival PAPERCRAFT diorama: everything folded and cut from Japanese washi paper and thin card, crisp cut edges, visible paper fibre, warm golden lantern light glowing against a deep indigo night sky full of rising sky lanterns',
    pweeg: 'Pweeg, a little boxy ORIGAMI figure folded from cream washi paper (a big rounded-cube head with two black ink-dot eyes, a small pleated paper body, chunky folded arms and legs) — copy him exactly from the attached figure',
    chad: 'Chad, Pweeg\'s cool friend: the same boxy origami paper figure wearing black folded-paper sunglasses — copy him from the attached figure',
    umbrella: 'a red-and-cream Japanese wagasa paper parasol with bamboo ribs',
    mine: 'an angry spiky red paper firecracker mine with a burning fuse',
    walldorf: 'Walldorf, a tall folded-paper pillar spirit in amber paper with two stacked googly eyes',
    finishPlace: 'a round golden festival dais with tassels and pennants',
    wind: 'rising currents drawn as folded blue washi paper strips printed with arrows'
  },
  clay: {
    sheets: join(ROOT, 'art-sheets', 'umbrella-clay'),
    concept: 'style/clay-key.png',
    finish: 'a stop-motion CLAYMATION set: everything modelled from soft plasticine with thumbprint texture and a soft satin sheen, a cosy rainy evening over clay rooftops, chimneys and lit windows',
    pweeg: 'Pweeg, a little white clay POSTMAN (a soft rounded body, two black bead eyes, a blue postman cap, a brown satchel across his chest, stubby clay arms and legs) — copy him exactly from the attached figure',
    chad: 'Chad, Pweeg\'s cool friend: the same white clay postman wearing black clay sunglasses — copy him from the attached figure',
    umbrella: 'a red-and-white striped clay umbrella with a wooden crook handle',
    mine: 'an angry spiky crimson clay mine ball with little pointed clay teeth',
    walldorf: 'Walldorf, a tall chimney-stack creature of brick-red clay with two stacked white googly eyes',
    finishPlace: 'a sandstone clay doorstep with a red pillar postbox and yellow bunting',
    wind: 'rising currents of rolled pale-blue clay swooshes and clay arrows with autumn leaves'
  }
}

/** The four scenes, from the CTR evidence: one big expressive face, the game's own action, few
 *  elements, strong contrast — each a different promise of what the game is. */
const SCENES = {
  glide: (s) => `THE MOMENT: ${s.pweeg} floats up through the middle of the picture hanging from ${s.umbrella} held overhead in both hands, carried up by ${s.wind}. He is BIG in the frame (his umbrella and body fill about half the picture's height), his face wide-eyed with delight. Below him, small and out of focus, ${s.mine} waits in the dark. Simple sky behind, lots of space round him.`,
  danger: (s) => `THE MOMENT: ${s.pweeg} tumbles through the air in PANIC, eyes huge, mouth wide open, his ${s.umbrella} blown inside-out above him; right in front of him, BIG and close to the camera, ${s.mine} grins at him. The two faces are the whole picture: his fear, its glee. A dark, simple background so both faces pop.`,
  duo: (s) => `THE MOMENT: ${s.chad} and ${s.pweeg} side by side, close up and big in the frame: Chad relaxed and cool, leaning on his furled umbrella with one hand raised in a lazy wave; Pweeg next to him gripping ${s.umbrella} open overhead, wobbly and nervous, about to be lifted off his feet by a gust. Behind them, a little smaller, ${s.walldorf} peeks in. Simple background.`,
  finish: (s) => `THE MOMENT: ${s.pweeg} drifts down under ${s.umbrella} toward ${s.finishPlace} in the lower right, arms up in triumph, glowing golden collectibles (a star, a little umbrella, a cloud) sparkling round him; behind him a glimpse of the course he crossed — ${s.wind} and, small, ${s.mine}. He is the biggest thing in the picture.`
}

const ASPECTS = {
  '16x9': { w: 1376, h: 774, out: 'one LANDSCAPE image, 16:9, about 1376 x 774 pixels' },
  '1x1': { w: 1024, h: 1024, out: 'one SQUARE image, 1:1, 1024 x 1024 pixels' },
  '9x16': { w: 774, h: 1376, out: 'one PORTRAIT image, 9:16, about 774 x 1376 pixels' }
}

const coverPrompt = (style, scene, aspect) => {
  const s = STYLES[style]
  return [
    'WHAT COMES BACK IS ONE FINISHED COVER ILLUSTRATION FOR A WEB GAME CALLED UMBRELLA — a single picture, not a sheet, not a screenshot.',
    `ART STYLE: ${s.finish}. The FIRST attached image is this game's approved concept art: copy its finish, light and palette exactly. Every other attached figure is a character of the game: copy his design exactly.`,
    SCENES[scene](s),
    'MADE TO BE CLICKED: one clear focal point, the main face large and expressive, strong contrast between the characters and the background, bold readable shapes that still read as a small thumbnail, a little rim light round the characters. Nothing cluttered, no tiny detail in the important places.',
    'NO TEXT ANYWHERE: no title, no logo, no letters, no numbers, no UI, no buttons, no score, no signature, no watermark, no frame or border.',
    'COMPOSITION: keep the main face and the action in the middle and the right of the picture; the TOP LEFT quarter holds only calm background (a store lays its own badge there). Keep a calm, darker band along the bottom right where a logo can go.',
    `The LAST attached image only fixes the shape of the picture: paint ${ASPECTS[aspect].out}, painted edge to edge, nothing taken from that image.`,
    'CHECK BEFORE ANSWERING: one picture; no text; the main face big and clear; the top-left quarter calm.'
  ].join('\n\n')
}

const logoPrompt = (style) => {
  const s = STYLES[style]
  const look = style === 'clay'
    ? 'the letters are modelled from soft plasticine: chunky, rounded, a little squashed and playful, cream-white clay with a thick postal-blue clay outline and a soft blue clay drop shadow, a small red-and-white striped clay umbrella standing in for the dot or hooked over the first letter'
    : 'the letters are cut and folded from washi paper: bold rounded letters in warm glowing cream-gold paper with a lacquer-red cut-paper outline and a thin gold rim, a small red wagasa paper parasol tucked against the first letter, a soft lantern glow kept INSIDE the paper'
  return [
    'WHAT COMES BACK IS ONE GAME LOGO WORDMARK, ALONE, CENTRED ON A FLAT MAGENTA (#FF00FF) BACKGROUND.',
    'The word is exactly: UMBRELLA — eight letters, spelled U-M-B-R-E-L-L-A, nothing else written anywhere.',
    `STYLE: ${look}. The FIRST attached image is the game's concept art: match its finish (${s.finish.split(':')[0]}).`,
    'Bold, chunky, highly legible at small size, slightly playful (the letters may bob a little up and down), one line of text. NO glow, shadow or halo spilling onto the magenta beyond the outline except the drop shadow described.',
    'OUTPUT: one landscape image, 1376 x 768 pixels, the wordmark filling about 80% of the width, flat #FF00FF magenta all round, PNG.'
  ].join('\n\n')
}

const plate = (style, aspect) => {
  const p = join(DIR, 'plates', `${style}-${aspect}.png`)
  return p
}

const cmd = process.argv[2]
const styleArg = process.argv.includes('--style') ? process.argv[process.argv.indexOf('--style') + 1] : null
const styles = styleArg ? [styleArg] : Object.keys(STYLES)
mkdirSync(join(DIR, 'painted'), { recursive: true })

if (cmd === 'jobs') {
  const kind = process.argv[3]
  const jobs = []
  for (const style of styles) {
    const s = STYLES[style]
    const card = (n) => join(s.sheets, 'cards', `${n}-model-card.png`)
    const concept = join(s.sheets, s.concept)
    const cast = (scene) => scene === 'duo' ? [card('chad'), card('pweeg')] : [card('pweeg')]
    if (kind === 'scenes') {
      for (const scene of Object.keys(SCENES)) {
        jobs.push({ id: `${style}-${scene}-16x9`, out: join(DIR, 'painted', `${style}-${scene}-16x9.png`), ref: plate(style, '16x9'), also: [concept, ...cast(scene)], prompt: coverPrompt(style, scene, '16x9') })
      }
    } else if (kind === 'masters') {
      const chosen = JSON.parse(readFileSync(join(DIR, 'chosen.json'), 'utf-8'))
      const scene = chosen[style]
      for (const aspect of ['1x1', '9x16']) {
        jobs.push({ id: `${style}-${scene}-${aspect}`, out: join(DIR, 'painted', `${style}-${scene}-${aspect}.png`), ref: plate(style, aspect), also: [concept, ...cast(scene), join(DIR, 'painted', `${style}-${scene}-16x9.png`)], prompt: coverPrompt(style, scene, aspect).replace('The LAST attached image only fixes the shape', 'The second-to-last attached image is the APPROVED LANDSCAPE COVER of this scene: repaint THE SAME scene, characters, poses and colours, re-composed for the new shape. The LAST attached image only fixes the shape') })
      }
    } else if (kind === 'logos') {
      jobs.push({ id: `${style}-logo`, out: join(DIR, 'painted', `${style}-logo.png`), ref: plate(style, '16x9'), also: [concept], prompt: logoPrompt(style) })
    }
  }
  const file = join(DIR, `jobs-${kind}.json`)
  writeFileSync(file, JSON.stringify(jobs, null, 1))
  console.log(`${jobs.length} job(s) → ${file}`)
}
