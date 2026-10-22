"use client"

import React from "react"
import { useState, useEffect, useMemo, useRef } from "react"
import localFont from "next/font/local"
import { MotionConfig, motion, useReducedMotion, useScroll, useSpring, type Variants } from "motion/react"
import { Section } from "@/components/section"
import { sectionType } from "@/lib/section-typography"
import { Cinzel } from "next/font/google"
import { useSiteConfig } from "@/hooks/use-site-config"
import { fetchUntilReady, isAbortError } from "@/lib/fetch-until-ready"
import { fetchInvitationList, readCachedInvitationList } from "@/lib/invitation-data"
import { PlainBubbles } from "@/components/loader/PlainBubbles"
import { SectionBackdrop } from "@/components/section-backdrop"
import { TintedDeco } from "@/components/tinted-deco"
import { DecoCorners } from "@/components/deco-corners"

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
})

const theSeasons = localFont({
  src: "../../Font/Fontspring-DEMO-theseasons-reg.otf",
  display: "swap",
  variable: "--font-the-seasons",
})

const aboveTheBeyond = localFont({
  src: "../../Font/above-the-beyond-script.otf",
  display: "swap",
  variable: "--font-above-beyond",
})

// Palette lives in globals.css → motif / welcome tokens.
const PAPER = "var(--color-welcome-bg-soft)"
const ACCENT = "var(--color-welcome-heading)" // dusty blue — readable on light backgrounds (was sunshine yellow)
const NAVY = "var(--color-ink-deep)"
const SCRIPT = "var(--color-ink-accent)"
const BODY = "var(--color-welcome-text)"
const HAIRLINE = "color-mix(in srgb, var(--color-motif-medium) 60%, transparent)"

// Same circle pattern as the gallery / details sections (PlainBubbles paints the base)
const sectionBg = "var(--color-bg-pattern-base)"

// Text sitting directly on the circle pattern (colors: globals.css → --color-on-pattern*)
const onBg = {
  color: "var(--color-ink-deep)",
  textShadow:
    "0 0 1px var(--color-on-pattern-glow), 0 1px 0 var(--color-on-pattern-glow), 0 0 14px var(--color-on-pattern-glow), 0 0 26px var(--color-on-pattern-glow)",
} as const

const onBgLineStyle = {
  background: "var(--color-ink-accent)",
} as const

const cardStyle = {
  background: PAPER,
  boxShadow:
    "0 26px 56px -30px color-mix(in srgb, var(--color-welcome-navy) 55%, transparent), inset 0 1px 0 rgb(255 255 255 / 80%)",
} as const

const palette = {
  body: BODY,
  heading: NAVY,
  label: ACCENT,
  accent: ACCENT,
} as const

function DecoImg({ src, className }: { src: string; className: string }) {
  if (!src) return null
  return <TintedDeco src={src} className={className} />
}

function OutsideDivider() {
  return (
    <div className="flex items-center justify-center gap-2">
      <span className="h-px w-10 sm:w-16" style={{ background: "var(--color-ink-accent)" }} />
      <span className="h-1.5 w-1.5 rotate-45" style={{ background: "var(--color-ink-accent)" }} aria-hidden />
      <span className="h-px w-10 sm:w-16" style={{ background: "var(--color-ink-accent)" }} />
    </div>
  )
}

// Role category headings: one font (Cinzel capitals) for every heading — it has all
// the glyphs ("&", "-", …), so nothing switches font mid-heading
const SECTION_TITLE_CLASS = `${cinzel.className} font-semibold text-[0.64rem] sm:text-[0.8rem] md:text-[0.9rem] tracking-[0.14em] sm:tracking-[0.16em] md:tracking-[0.18em] uppercase leading-tight`

// Names in Cormorant Garamond (loaded in app/layout.tsx) — an elegant serif that
// stays readable at small sizes; slightly smaller on phones
const NAME_FONT = '"Cormorant Garamond", "SortsMillGoudy", Georgia, serif'

const nameStyle: React.CSSProperties = {
  fontFamily: NAME_FONT,
  fontWeight: 600,
  fontSize: "clamp(0.8rem, min(3.4vw, 4.4cqi), 1.12rem)",
  lineHeight: 1.2,
  letterSpacing: "0.01em",
}

const featuredNameSize = "clamp(0.9rem, min(3.8vw, 4.8cqi), 1.24rem)"

// Role titles: small engraved capitals in Cinzel
const roleTitleStyle: React.CSSProperties = {
  fontSize: "clamp(0.5rem, min(2.15vw, 2.7cqi), 0.68rem)",
  lineHeight: 1.25,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
}

const ROMAN_NUMERAL = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)$/i
const SPECIAL_GLYPH = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|&|\+|[.’'`´-]|—|–)$/i
const SPECIAL_SPLIT = /(\b(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)\b|&|\+|[.’'`´-]|—|–)/g
const DASH_GLYPH = /^[-—–]$/
const PLUS_GLYPH = /^\+$/

function toDisplayName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) return part
          if (ROMAN_NUMERAL.test(part)) return part.toUpperCase()
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        })
        .join("-"),
    )
    .join(" ")
}

function MixedFontText({
  text,
  specialClassName,
}: {
  text: string
  specialClassName: string
}) {
  const parts = text.split(new RegExp(SPECIAL_SPLIT.source, "g"))
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null
        if (DASH_GLYPH.test(part)) {
          return (
            <span
              key={`${part}-${index}`}
              className="font-normal not-italic tracking-normal"
              style={{ fontFamily: '"SortsMillGoudy", Georgia, "Times New Roman", serif' }}
            >
              {part}
            </span>
          )
        }
        if (PLUS_GLYPH.test(part)) {
          return (
            <span
              key={`${part}-${index}`}
              className="relative -top-[0.08em] mx-[0.1em] inline-block font-normal not-italic tracking-normal"
              style={{
                fontFamily: '"SortsMillGoudy", Georgia, "Times New Roman", serif',
                fontSize: "0.95em",
              }}
              aria-label="of blessed memory"
            >
              †
            </span>
          )
        }
        if (SPECIAL_GLYPH.test(part)) {
          return (
            <span key={`${part}-${index}`} className={specialClassName}>
              {part}
            </span>
          )
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
      })}
    </>
  )
}

function CouplePromiseMark({ kicker, line }: { kicker: string; line: string }) {
  return (
    <div className="-mt-2 mb-3 text-center sm:-mt-4 sm:mb-5 md:-mt-5 md:mb-6">
      <p
        className={`${cinzel.className} text-[0.62rem] font-semibold uppercase tracking-[0.18em] sm:text-[0.6875rem] sm:tracking-[0.24em] md:tracking-[0.28em]`}
        style={{ color: ACCENT }}
      >
        {kicker}
      </p>
      <p
        className={`font-goudy-italic mx-auto mt-1.5 max-w-[16rem] text-[0.76rem] sm:text-sm sm:mt-2`}
        style={{ color: BODY }}
      >
        {line}
      </p>
    </div>
  )
}

function EntourageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <h2
      className="welcome-title-lockup relative mx-auto w-full max-w-full text-center"
      style={
        {
          "--title-size": "clamp(1.25rem, min(5.8vw, 8cqi), 3rem)",
          "--script-size": "clamp(0.78rem, min(3.2vw, 4.8cqi), 1.85rem)",
        } as React.CSSProperties
      }
    >
      <span className="sr-only">{title} — {subtitle}</span>
      <span
        aria-hidden
        className={`${theSeasons.className} block uppercase leading-[0.9] tracking-[0.04em] min-[400px]:tracking-[0.08em] sm:tracking-[0.12em] md:tracking-[0.14em]`}
        style={{
          fontSize: "var(--title-size)",
          ...onBg,
        }}
      >
        {title}
      </span>
      <span
        aria-hidden
        className={`${aboveTheBeyond.className} relative z-10 mx-auto mt-1.5 block w-fit max-w-full px-1 leading-[0.88] sm:mt-2 sm:leading-[0.9]`}
        style={{
          fontSize: "var(--script-size)",
          ...onBg,
        }}
      >
        {subtitle}
      </span>
    </h2>
  )
}

interface EntourageMember {
  name: string
  roleCategory: string
  roleTitle: string
  email: string
}

interface PrincipalSponsor {
  malePrincipalSponsor: string
  femalePrincipalSponsor: string
}

/** Accepts PascalCase from API / Sheets or camelCase */
function entourageMemberFromApi(row: Record<string, unknown>): EntourageMember {
  const r = row as Record<string, string | undefined>
  return {
    name: r.name ?? r.Name ?? "",
    roleCategory: r.roleCategory ?? r.RoleCategory ?? "",
    roleTitle: r.roleTitle ?? r.RoleTitle ?? "",
    email: r.email ?? r.Email ?? "",
  }
}

function firstSheetText(row: Record<string, string | undefined>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]?.trim()
    if (value) return value
  }
  return ""
}

function principalSponsorFromApi(row: Record<string, unknown>): PrincipalSponsor {
  const r = row as Record<string, string | undefined>
  return {
    malePrincipalSponsor: firstSheetText(r, [
      "malePrincipalSponsor",
      "MalePrincipalSponsor",
      "Male",
      "Ninong",
      "ninong",
    ]),
    femalePrincipalSponsor: firstSheetText(r, [
      "femalePrincipalSponsor",
      "FemalePrincipalSponsor",
      "Female",
      "Ninang",
      "ninang",
    ]),
  }
}

const ct = {
  label: sectionType.label,
  sectionTitle: `${sectionType.label} lg:text-base`,
  body: sectionType.text,
  bodyLg: sectionType.subheader,
} as const

const ROLE_CATEGORY_ORDER = [
  "OFFICIATING MINISTER",
  "The Couple",
  "Parents of the Groom",
  "Parents of the Bride",
  "Family of the Groom",
  "Family of the Bride",
  "Man of Honor",
  "Matron of Honor",
  "Best Man",
  "Maid of Honor",
  "Little Groom",
  "Little Bride",
  "Little Tiny Groom",
  "Little Love Bearer",
  "Little Promise Bearer",
  // Secondary Sponsors chapter (see SECONDARY_SPONSOR_GROUPS)
  "Candle Sponsors",
  "Candle Bearer",
  "Veil Sponsors",
  "Cord Sponsors",
  "Ribbon Sponsors",
  "Groomsmen",
  "Bridesmaids",
  // Little Groomsmen | Little Bridesmaids across the aisle
  "Little Groomsmen",
  "Little Bridesmaids",
  // Ring | Coin across the aisle, Bible on the aisle below
  "Ring Bearer",
  "Coin Bearer",
  "Bible Bearer",
  "Flower Ladies",
]

const SINGLE_COLUMN_SECTIONS = new Set([
  "Best Man",
  "Maid of Honor",
  "Ring Bearer",
  "Coin Bearer",
  "Bible Bearer",
  "Flower Girls",
  "Presider",
])

// Heading = the category exactly as written in the sheet (e.g. "Candle Sponsors",
// "Veil Sponsor", "Cord Sponsors", "Ribbon Sponsor"). Spelling variants are still
// grouped together by normalizeRoleCategory; the first member's text is shown.
function displayRoleCategory(category: string, members: EntourageMember[] = []) {
  return members[0]?.roleCategory?.trim() || category
}

function normalizeRoleCategory(category: string): string {
  const normalized = category.trim()
  if (normalized.toLowerCase() === "officiating minister") {
    return "OFFICIATING MINISTER"
  }
  const honorAliases: Record<string, string> = {
    "man of honor": "Man of Honor",
    "best man": "Best Man",
    "maid of honor": "Maid of Honor",
    "matron of honor": "Matron of Honor",
  }
  const alias = honorAliases[normalized.toLowerCase()]
  if (alias) return alias
  if (/^little love bearers?$/i.test(normalized)) return "Little Love Bearer"
  if (/^candle bearers?$/i.test(normalized)) return "Candle Bearer"
  if (/^candle sponsors?$/i.test(normalized)) return "Candle Sponsors"
  if (/^ribbon sponsors?$/i.test(normalized)) return "Ribbon Sponsors"
  if (/^ch?ord sponsors?$/i.test(normalized)) return "Cord Sponsors"
  // Sheet may say "Cloth Sponsors" — same group as the veil sponsors
  if (/^(cloth|veil) sponsors?$/i.test(normalized)) return "Veil Sponsors"
  if (normalized.toLowerCase() === "peer sponsors") {
    return "Peer Sponsors"
  }
  if (
    normalized.toLowerCase() === "flower ladies" ||
    normalized.toLowerCase() === "flower girls"
  ) {
    return "Flower Ladies"
  }
  return normalized
}

function isCoupleMember(member: EntourageMember): boolean {
  return normalizeRoleCategory(member.roleCategory) === "The Couple"
}

function sortGroomParents(members: EntourageMember[]): EntourageMember[] {
  return [...members].sort((a, b) => {
    const aIsFather = a.roleTitle?.toLowerCase().includes("father") ?? false
    const bIsFather = b.roleTitle?.toLowerCase().includes("father") ?? false
    if (aIsFather && !bIsFather) return -1
    if (!aIsFather && bIsFather) return 1
    return 0
  })
}

function sortBrideParents(members: EntourageMember[]): EntourageMember[] {
  return [...members].sort((a, b) => {
    const aIsMother = a.roleTitle?.toLowerCase().includes("mother") ?? false
    const bIsMother = b.roleTitle?.toLowerCase().includes("mother") ?? false
    if (aIsMother && !bIsMother) return -1
    if (!aIsMother && bIsMother) return 1
    return 0
  })
}

function toEntourageMembers(data: Record<string, unknown>[]): EntourageMember[] {
  return data
    .map((row) => entourageMemberFromApi(row))
    .filter((member) => member.name.trim())
    .filter((member) => !isCoupleMember(member))
}

function toPrincipalSponsors(data: Record<string, unknown>[]): PrincipalSponsor[] {
  return data
    .map((row) => principalSponsorFromApi(row))
    .filter((sponsor) => sponsor.malePrincipalSponsor.trim() || sponsor.femalePrincipalSponsor.trim())
}

async function loadEntourageFromApi(signal?: AbortSignal, reload = false): Promise<EntourageMember[]> {
  const data = await fetchInvitationList<Record<string, unknown>>("/api/entourage", { signal, reload })
  return toEntourageMembers(data)
}

export type SponsorsList = "one" | "two"

function sponsorsUrl(list?: SponsorsList) {
  return list ? `/api/principal-sponsor?list=${list}` : "/api/principal-sponsor"
}

async function loadSponsorsFromApi(url: string, signal?: AbortSignal, reload = false): Promise<PrincipalSponsor[]> {
  // Sponsors are optional — never block the entourage on them
  try {
    const data = await fetchInvitationList<Record<string, unknown>>(url, { signal, reload })
    return toPrincipalSponsors(data)
  } catch (error) {
    if (isAbortError(error)) throw error
    console.warn("Failed to load principal sponsors:", error)
    return []
  }
}

function readCachedParty(sponsorsPath: string) {
  const members = readCachedInvitationList<Record<string, unknown>>("/api/entourage")
  const sponsors = readCachedInvitationList<Record<string, unknown>>(sponsorsPath)
  return {
    members: members ? toEntourageMembers(members) : [],
    sponsors: sponsors ? toPrincipalSponsors(sponsors) : [],
  }
}

// ---------------------------------------------------------------------------
// "The Aisle" — the card reads like walking into the church: a thread runs down
// the middle, the groom's people sit on the left, the bride's on the right, and
// every group of the party is a numbered chapter on the way to the altar.
// ---------------------------------------------------------------------------

const THREAD = "color-mix(in srgb, var(--color-welcome-heading) 42%, transparent)"
const RUNNER =
  "linear-gradient(to right, transparent, color-mix(in srgb, var(--color-motif-silver) 22%, transparent) 30%, color-mix(in srgb, var(--color-motif-silver) 22%, transparent) 70%, transparent)"
const RUNNER_UNROLLED =
  "linear-gradient(to right, transparent, color-mix(in srgb, var(--color-motif-silver) 48%, transparent) 28%, color-mix(in srgb, var(--color-motif-silver) 48%, transparent) 72%, transparent)"

// Left lane | thread | right lane
const AISLE_GRID = "grid grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]"

const SECONDARY_SPONSOR_GROUPS = [
  "Candle Sponsors",
  "Candle Bearer",
  "Veil Sponsors",
  "Cord Sponsors",
  "Ribbon Sponsors",
] as const

const LITTLE_SOLO_GROUPS = ["Little Tiny Groom", "Little Love Bearer", "Little Promise Bearer"] as const

// A seat can be empty so rows stay aligned (e.g. a sponsor couple with one name)
type Seat = EntourageMember | undefined

interface Lane {
  title?: string
  members: Seat[]
}

type Block =
  | { kind: "pair"; key: string; title?: string; caption?: string; left: Lane; right: Lane; showRole: boolean }
  | { kind: "center"; key: string; title?: string; caption?: string; members: EntourageMember[]; showRole: boolean }

interface Chapter {
  key: string
  title?: string
  caption?: string
  blocks: Block[]
}

interface BlockOptions {
  title?: string
  caption?: string
  showRole?: boolean
}

function seated(seats: Seat[]): EntourageMember[] {
  return seats.filter((seat): seat is EntourageMember => Boolean(seat))
}

function asSeat(name: string): Seat {
  return name ? { name, roleCategory: "", roleTitle: "", email: "" } : undefined
}

// Two lanes across the aisle; when only one lane has names they move onto the aisle
function pairBlock(
  key: string,
  left: Lane,
  right: Lane,
  { title, caption, showRole = true }: BlockOptions = {},
): Block | null {
  const leftMembers = seated(left.members)
  const rightMembers = seated(right.members)
  if (leftMembers.length === 0 && rightMembers.length === 0) return null
  if (leftMembers.length === 0 || rightMembers.length === 0) {
    const lane = leftMembers.length > 0 ? left : right
    const members = leftMembers.length > 0 ? leftMembers : rightMembers
    return { kind: "center", key, title: lane.title ?? title, caption, members, showRole }
  }
  return { kind: "pair", key, title, caption, left, right, showRole }
}

// One group: a single name stands on the aisle, more are split across both lanes
function groupBlock(
  key: string,
  members: EntourageMember[],
  { stack = false, ...options }: BlockOptions & { stack?: boolean } = {},
): Block | null {
  if (members.length === 0) return null
  if (stack || members.length === 1) {
    const { title, caption, showRole = true } = options
    return { kind: "center", key, title, caption, members, showRole }
  }
  const half = Math.ceil(members.length / 2)
  return pairBlock(key, { members: members.slice(0, half) }, { members: members.slice(half) }, options)
}

function buildChapters(
  grouped: Record<string, EntourageMember[]>,
  sponsors: PrincipalSponsor[],
  label: (heading: string) => string,
): Chapter[] {
  const members = (category: string) => grouped[category] ?? []
  const heading = (category: string) => label(displayRoleCategory(category, members(category)))
  const lane = (category: string, title = category): Lane => ({ title: label(title), members: members(category) })
  const chapters: Chapter[] = []
  const chapter = (key: string, blocks: (Block | null)[], extra: Omit<Chapter, "key" | "blocks"> = {}) => {
    const kept = blocks.filter((block): block is Block => block !== null)
    if (kept.length > 0) chapters.push({ key, blocks: kept, ...extra })
  }

  chapter(
    "parents",
    [
      pairBlock(
        "parents",
        { title: label("Parents of the Groom"), members: sortGroomParents(members("Parents of the Groom")) },
        { title: label("Parents of the Bride"), members: sortBrideParents(members("Parents of the Bride")) },
        { showRole: false },
      ),
    ],
    { caption: "With the blessings of our Parents" },
  )
  chapter("officiant", [
    groupBlock("officiant", members("OFFICIATING MINISTER"), {
      title: label("OFFICIATING MINISTER"),
      caption: "To solemnize the marriage and lead the couple in their covenant before God.",
      showRole: false,
      stack: true,
    }),
  ])
  chapter("sponsors", [
    pairBlock(
      "principal",
      { members: sponsors.map((sponsor) => asSeat(sponsor.malePrincipalSponsor)) },
      { members: sponsors.map((sponsor) => asSeat(sponsor.femalePrincipalSponsor)) },
      {
        title: label("Principal Sponsors"),
        caption: "To stand as principal witnesses in our exchange of vows",
        showRole: false,
      },
    ),
    groupBlock("peer", members("Peer Sponsors"), { title: label("Peer Sponsors"), showRole: false }),
  ])
  chapter("family", [pairBlock("family", lane("Family of the Groom"), lane("Family of the Bride"))])
  chapter("honor", [
    groupBlock("man-of-honor", members("Man of Honor"), { title: label("Man of Honor"), stack: true }),
    pairBlock("best-man-maid", lane("Best Man"), lane("Maid of Honor")),
    groupBlock("matron", members("Matron of Honor"), { title: label("Matron of Honor"), showRole: false, stack: true }),
  ])
  chapter("little-couple", [pairBlock("little-couple", lane("Little Groom"), lane("Little Bride"))])
  for (const category of LITTLE_SOLO_GROUPS) {
    chapter(category, [groupBlock(category, members(category), { title: heading(category) })])
  }
  chapter(
    "secondary",
    SECONDARY_SPONSOR_GROUPS.map((category) => groupBlock(category, members(category), { title: heading(category) })),
    { title: label("Secondary Sponsors") },
  )
  chapter("bridal", [pairBlock("bridal", { members: members("Groomsmen") }, { members: members("Bridesmaids") })], {
    title: label("Beloved Entourage"),
  })
  chapter("little-party", [pairBlock("little-party", lane("Little Groomsmen"), lane("Little Bridesmaids"))])
  chapter("bearers", [
    pairBlock("ring-coin", lane("Ring Bearer"), lane("Coin Bearer")),
    groupBlock("bible", members("Bible Bearer"), { title: label("Bible Bearer"), stack: true }),
  ])
  chapter("flowers", [groupBlock("flowers", members("Flower Ladies"), { title: label("Flower Girls") })])

  // Any category from the sheet that isn't in the ordered list
  Object.keys(grouped)
    .filter((category) => !ROLE_CATEGORY_ORDER.includes(category) && category !== "Other" && category !== "Peer Sponsors")
    .forEach((category) => {
      chapter(category, [
        groupBlock(category, members(category), { title: heading(category), stack: SINGLE_COLUMN_SECTIONS.has(category) }),
      ])
    })

  return chapters
}

const ROMAN_STEPS: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
]

function toRoman(value: number) {
  let rest = value
  let out = ""
  for (const [step, glyph] of ROMAN_STEPS) {
    while (rest >= step) {
      out += glyph
      rest -= step
    }
  }
  return out
}

// ── Scroll animation ────────────────────────────────────────────────────────
// Every piece animates itself the first time it scrolls into view, so long lists
// keep revealing row by row as the guest walks down the aisle. The whole section
// sits in <MotionConfig reducedMotion="user">: with reduced motion only the fades run.

const EASE = [0.22, 1, 0.36, 1] as const
const IN_VIEW = { once: true, margin: "0px 0px -12% 0px" } as const

const rise: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
}

const stagger = (gap: number, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren } },
})

// Names glide in toward the aisle from their own side
const fromSide = (x: number, delay = 0): Variants => ({
  hidden: { opacity: 0, x, filter: "blur(4px)" },
  show: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.85, ease: EASE, delay } },
})

// Flourishes either side of a medallion grow outward from it
const growOut = (origin: "left" | "right"): Variants => ({
  hidden: { scaleX: 0, opacity: 0 },
  show: { scaleX: 1, opacity: 1, transition: { duration: 0.9, ease: EASE, delay: origin === "left" ? 0.05 : 0 } },
})
const fromLeft = fromSide(-22)
const fromRight = fromSide(22, 0.08)

// Thread segments draw downward
const drawDown: Variants = {
  hidden: { scaleY: 0 },
  show: { scaleY: 1, transition: { duration: 0.6, ease: EASE } },
}

const popIn = (delay = 0): Variants => ({
  hidden: { opacity: 0, scale: 0.4 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 260, damping: 17, delay } },
})

const knotIn: Variants = {
  hidden: { opacity: 0, scale: 0, rotate: 45 },
  show: { opacity: 1, scale: 1, rotate: 45, transition: { type: "spring", stiffness: 300, damping: 16, delay: 0.2 } },
}

// The monogram is "inked" in from left to right
const inkIn: Variants = {
  hidden: { opacity: 0, scale: 0.92, clipPath: "inset(0% 100% 0% 0%)" },
  show: {
    opacity: 1,
    scale: 1,
    clipPath: "inset(0% 0% 0% 0%)",
    transition: { duration: 1.4, ease: EASE, delay: 0.25 },
  },
}

function AisleName({
  member,
  side,
  showRole = true,
  featured = false,
}: {
  member: EntourageMember
  side: "left" | "right" | "center"
  showRole?: boolean
  featured?: boolean
}) {
  const textAlign = side === "left" ? "text-right" : side === "right" ? "text-left" : "text-center"
  const displayName = toDisplayName(member.name)
  const displayRole = member.roleTitle ? toDisplayName(member.roleTitle) : ""
  return (
    <div className={`min-w-0 max-w-full ${textAlign}`}>
      <p
        className="break-words"
        style={{ ...nameStyle, ...(featured ? { fontSize: featuredNameSize } : {}), color: NAVY }}
        title={displayName.replace(/\+/g, "†")}
      >
        {displayName ? <MixedFontText text={displayName} specialClassName="tracking-normal" /> : null}
      </p>
      {showRole && displayRole && (
        <p
          className={`${cinzel.className} mt-0.5 break-words font-semibold`}
          style={{ ...roleTitleStyle, color: SCRIPT }}
          title={displayRole}
        >
          <MixedFontText text={displayRole} specialClassName="tracking-normal" />
        </p>
      )}
    </div>
  )
}

// The middle column of a row: the thread, with a small knot beside each pair of names
function AisleThread({ knot = false }: { knot?: boolean }) {
  return (
    <motion.div
      className="relative flex items-center justify-center"
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      aria-hidden
    >
      <motion.span
        variants={drawDown}
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 origin-top"
        style={{ background: THREAD }}
      />
      {knot && (
        <motion.span
          variants={knotIn}
          className="relative size-[5px] sm:size-1.5"
          style={{ background: ACCENT, boxShadow: `0 0 0 3px ${PAPER}` }}
        />
      )}
    </motion.div>
  )
}

function BlockTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.h3
      variants={rise}
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      className={`${SECTION_TITLE_CLASS} break-words ${className}`}
      style={{ color: NAVY }}
    >
      {children}
    </motion.h3>
  )
}

function AisleCaption({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      variants={rise}
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      className="font-goudy-italic mx-auto mb-2 max-w-md px-4 text-center text-[0.74rem] leading-snug sm:mb-3 sm:text-sm md:text-[0.95rem]"
      style={{ color: SCRIPT }}
    >
      {children}
    </motion.p>
  )
}

function LaneCell({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  return (
    <motion.div
      className="min-w-0 py-1 sm:py-1.5"
      variants={side === "left" ? fromLeft : fromRight}
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
    >
      {children}
    </motion.div>
  )
}

function AisleBlock({ block }: { block: Block }) {
  return (
    <div className="mt-4 first:mt-0 sm:mt-6">
      {block.title && <BlockTitle className="mb-1 text-center sm:mb-2">{block.title}</BlockTitle>}
      {block.caption && <AisleCaption>{block.caption}</AisleCaption>}
      {block.kind === "pair" ? (
        <div className={AISLE_GRID}>
          {(block.left.title || block.right.title) && (
            <>
              <BlockTitle className="self-end pb-1 text-right sm:pb-2">{block.left.title}</BlockTitle>
              <AisleThread />
              <BlockTitle className="self-end pb-1 text-left sm:pb-2">{block.right.title}</BlockTitle>
            </>
          )}
          {Array.from({ length: Math.max(block.left.members.length, block.right.members.length) }, (_, row) => {
            const left = block.left.members[row]
            const right = block.right.members[row]
            return (
              <React.Fragment key={`${block.key}-${row}`}>
                <LaneCell side="left">
                  {left && <AisleName member={left} side="left" showRole={block.showRole} />}
                </LaneCell>
                <AisleThread knot />
                <LaneCell side="right">
                  {right && <AisleName member={right} side="right" showRole={block.showRole} />}
                </LaneCell>
              </React.Fragment>
            )
          })}
        </div>
      ) : (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2 px-2 sm:gap-3">
          {block.members.map((member, index) => (
            <motion.div
              key={`${block.key}-${index}-${member.name}`}
              className="min-w-0 max-w-full"
              variants={rise}
              initial="hidden"
              whileInView="show"
              viewport={IN_VIEW}
            >
              <AisleName member={member} side="center" showRole={block.showRole} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// Numbered medallion on the thread that opens each chapter: the thread draws
// down into it, the medallion springs open, then the thread carries on
function ChapterMark({ numeral }: { numeral: string }) {
  return (
    <motion.div
      className="flex flex-col items-center"
      variants={stagger(0.14)}
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      aria-hidden
    >
      <motion.span
        variants={drawDown}
        className="mb-1.5 h-6 w-px origin-top sm:mb-2 sm:h-9"
        style={{ background: `linear-gradient(to bottom, transparent, ${THREAD})` }}
      />
      <div className="flex items-center gap-2 sm:gap-3">
        <motion.span variants={growOut("right")} className="flex origin-right items-center gap-1.5">
          <span className="size-1 rounded-full" style={{ background: THREAD }} />
          <span className="h-px w-8 sm:w-16" style={{ background: `linear-gradient(to right, transparent, ${THREAD})` }} />
        </motion.span>
        <motion.span
          variants={popIn()}
          className="relative grid size-8 place-items-center rounded-full sm:size-10"
          style={{
            background: PAPER,
            border: `1px solid ${THREAD}`,
            boxShadow: `0 0 0 3px ${PAPER}, 0 0 0 4px ${HAIRLINE}`,
          }}
        >
          <motion.span
            className="absolute -inset-[7px] rounded-full border border-dashed sm:-inset-2"
            style={{ borderColor: THREAD }}
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          />
          <span
            className={`${cinzel.className} text-[0.56rem] font-semibold leading-none tracking-[0.08em] sm:text-[0.7rem]`}
            style={{ color: ACCENT }}
          >
            {numeral}
          </span>
        </motion.span>
        <motion.span variants={growOut("left")} className="flex origin-left items-center gap-1.5">
          <span className="h-px w-8 sm:w-16" style={{ background: `linear-gradient(to left, transparent, ${THREAD})` }} />
          <span className="size-1 rounded-full" style={{ background: THREAD }} />
        </motion.span>
      </div>
      <motion.span
        variants={drawDown}
        className="mt-1.5 h-2.5 w-px origin-top sm:mt-2 sm:h-4"
        style={{ background: `linear-gradient(to bottom, ${THREAD}, transparent)` }}
      />
    </motion.div>
  )
}

function AisleChapter({ chapter, numeral }: { chapter: Chapter; numeral: string }) {
  return (
    <section className="mt-3 sm:mt-5">
      <ChapterMark numeral={numeral} />
      {chapter.title && (
        <motion.h3
          variants={rise}
          initial="hidden"
          whileInView="show"
          viewport={IN_VIEW}
          className={`${aboveTheBeyond.className} mx-auto mb-1 w-fit max-w-full px-2 text-center leading-[1.05] sm:mb-2`}
          style={{ color: ACCENT, fontSize: "clamp(1.15rem, min(5.6vw, 6cqi), 1.9rem)" }}
        >
          {chapter.title}
        </motion.h3>
      )}
      {chapter.caption && <AisleCaption>{chapter.caption}</AisleCaption>}
      {chapter.blocks.map((block) => (
        <AisleBlock key={block.key} block={block} />
      ))}
    </section>
  )
}

// Where the aisle ends: the thread fades into a small ring
function AisleEnd() {
  return (
    <motion.div
      className="mt-4 flex flex-col items-center sm:mt-6"
      variants={stagger(0.2)}
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      aria-hidden
    >
      <motion.span
        variants={drawDown}
        className="h-8 w-px origin-top sm:h-12"
        style={{ background: `linear-gradient(to bottom, transparent, ${THREAD})` }}
      />
      <motion.span
        variants={popIn()}
        className="size-3 rounded-full sm:size-3.5"
        style={{ border: `1px solid ${ACCENT}` }}
      />
    </motion.div>
  )
}

// ── Card decoration ─────────────────────────────────────────────────────────

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

// One side of the arch, from the keystone down to the middle of the base
function archHalf(width: number, height: number, inset: number, side: "left" | "right") {
  const cx = width / 2
  const r = cx - inset
  const x = side === "left" ? inset : width - inset
  const sweep = side === "left" ? 0 : 1
  return `M ${cx} ${inset} A ${r} ${r} 0 0 ${sweep} ${x} ${inset + r} V ${height - inset} H ${cx}`
}

// The arch's hairline draws itself from the keystone down both sides; a dotted
// lace line follows just inside it
function ArchFrame({ width, height }: { width: number; height: number }) {
  if (!width || !height) return null
  const inset = width < 420 ? 8 : width < 600 ? 14 : 20
  const lace = inset + 6
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-30"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
    >
      {(["left", "right"] as const).map((side) => (
        <motion.path
          key={side}
          d={archHalf(width, height, inset, side)}
          stroke={HAIRLINE}
          strokeWidth={1}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.8, ease: EASE }}
        />
      ))}
      <motion.path
        d={`${archHalf(width, height, lace, "left")} ${archHalf(width, height, lace, "right")}`}
        stroke={ACCENT}
        strokeOpacity={0.35}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeDasharray="0 6"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.6, delay: 1.4 }}
      />
    </svg>
  )
}

const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

// Light falling through the church door: a soft glow and slow-turning rays at the top of the arch
function DoorwayLight() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 aspect-square overflow-hidden" aria-hidden>
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 42% at 50% 0%, rgb(255 255 255 / 95%), color-mix(in srgb, var(--color-motif-silver) 30%, transparent) 45%, transparent 75%)",
        }}
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -inset-x-1/4 top-0 h-full origin-top"
        style={{
          background:
            "repeating-conic-gradient(from 180deg at 50% 0%, color-mix(in srgb, var(--color-motif-silver) 38%, transparent) 0deg 3deg, transparent 3deg 11deg)",
          maskImage: "radial-gradient(ellipse 55% 70% at 50% 0%, black, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 55% 70% at 50% 0%, black, transparent 72%)",
        }}
        animate={{ rotate: [-2.5, 2.5, -2.5] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}

const PETAL_FILLS = [
  "color-mix(in srgb, var(--color-motif-silver) 90%, white)",
  "color-mix(in srgb, var(--color-welcome-heading) 45%, var(--color-motif-silver))",
  "var(--color-motif-cream)",
]

// Petals drift down the aisle the whole length of the card (hidden with reduced motion)
function PetalShower({ height }: { height: number }) {
  const reduceMotion = useReducedMotion()
  const petals = useMemo(() => {
    const count = Math.min(18, Math.max(6, Math.round(height / 320)))
    return Array.from({ length: count }, (_, i) => {
      // Fixed pseudo-random spread so the layout is stable between renders
      const seed = (i * 7919) % 101
      const duration = Math.max(14, height / 85) * (0.85 + (seed % 7) * 0.05)
      return {
        left: `${18 + ((seed * 37) % 64)}%`,
        size: 7 + (seed % 6),
        drift: 14 + (seed % 22),
        spin: (seed % 2 ? 1 : -1) * (180 + (seed % 5) * 60),
        duration,
        delay: -(duration * i) / count,
        fill: PETAL_FILLS[i % PETAL_FILLS.length],
      }
    })
  }, [height])
  if (reduceMotion || height < 200) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {petals.map((petal, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 12 16"
          className="absolute -top-6"
          style={{ left: petal.left, width: petal.size, height: petal.size * 1.35, opacity: 0.75 }}
          animate={{
            y: [0, height + 40],
            x: [0, petal.drift, -petal.drift * 0.6, petal.drift * 0.4, 0],
            rotate: [0, petal.spin],
          }}
          transition={{ duration: petal.duration, delay: petal.delay, repeat: Infinity, ease: "linear" }}
        >
          <path d="M6 0C10.5 3.5 11 10 6 16C1 10 1.5 3.5 6 0Z" fill={petal.fill} />
          <path d="M6 2.5V13" stroke="rgb(255 255 255 / 55%)" strokeWidth="0.6" />
        </motion.svg>
      ))}
    </div>
  )
}

// Garland on the peak of the arch: blooms in, then sways a little
function ArchGarland({ src }: { src: string }) {
  if (!src) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-5 z-40 flex justify-center sm:-top-8" aria-hidden>
      <motion.div
        initial={{ opacity: 0, scale: 0.55, y: -12 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.5 }}
      >
        <motion.div
          className="origin-bottom"
          animate={{ rotate: [-1.4, 1.4, -1.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <DecoImg src={src} className="block h-auto w-32 select-none drop-shadow-sm sm:w-48 md:w-56" />
        </motion.div>
      </motion.div>
    </div>
  )
}

// Bouquets resting on the bottom corners of the card
function CornerBouquet({ src, side }: { src: string; side: "left" | "right" }) {
  if (!src) return null
  const isLeft = side === "left"
  return (
    <motion.div
      className={`pointer-events-none absolute -bottom-6 z-40 w-28 sm:-bottom-9 sm:w-44 md:w-52 ${
        isLeft ? "-left-3 origin-bottom-left sm:-left-6" : "-right-3 origin-bottom-right sm:-right-6"
      }`}
      initial={{ opacity: 0, scale: 0.6, rotate: isLeft ? -10 : 10 }}
      whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ type: "spring", stiffness: 90, damping: 14 }}
      aria-hidden
    >
      <motion.div
        className={isLeft ? "origin-bottom-left" : "origin-bottom-right"}
        animate={{ rotate: isLeft ? [0, 1.6, 0] : [0, -1.6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: isLeft ? 0 : 1.2 }}
      >
        <DecoImg src={src} className={`block h-auto w-full select-none drop-shadow-md ${isLeft ? "" : "-scale-x-100"}`} />
      </motion.div>
    </motion.div>
  )
}

// Scalloped lace hem under the card
function LaceHem() {
  return (
    <div
      className="relative z-20 -mt-px h-[9px]"
      style={{
        background: `radial-gradient(circle at 50% 0, ${PAPER} 6.5px, transparent 7px) center top / 14px 9px repeat-x`,
        filter: "drop-shadow(0 5px 5px color-mix(in srgb, var(--color-welcome-navy) 14%, transparent))",
      }}
      aria-hidden
    />
  )
}

// A row of lace eyelets just inside the bottom edge
function LaceEyelets() {
  return (
    <div
      className="pointer-events-none absolute inset-x-5 bottom-3 z-30 h-[6px] sm:inset-x-8 sm:bottom-5"
      style={{ background: `radial-gradient(circle, ${HAIRLINE} 1.3px, transparent 1.8px) center / 14px 6px repeat-x` }}
      aria-hidden
    />
  )
}

// The couple's monogram, painted in the ink color through the image's alpha
function Monogram({ src, label, fallback }: { src: string; label: string; fallback: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div variants={inkIn} className="relative">
      {src ? (
        // A silvery glint passes through the ink every few seconds
        <motion.span
          role="img"
          aria-label={label}
          className="relative block aspect-[8/5] w-[4.75rem] min-[400px]:w-24 sm:w-32 md:w-36"
          animate={reduceMotion ? undefined : { backgroundPosition: ["100% 0%", "0% 0%"] }}
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 5, delay: 2 }}
          style={{
            backgroundImage: `linear-gradient(105deg, ${NAVY} 40%, color-mix(in srgb, ${NAVY} 30%, white) 50%, ${NAVY} 60%)`,
            backgroundSize: "300% 100%",
            backgroundPosition: "100% 0%",
            WebkitMaskImage: `url("${src}")`,
            maskImage: `url("${src}")`,
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      ) : (
        <span className="relative">{fallback}</span>
      )}
    </motion.div>
  )
}

function CoupleAtTheAltar({
  heading,
  kicker,
  line,
  monogram,
  groom,
  bride,
}: {
  heading: string
  kicker: string
  line: string
  monogram: string
  groom: EntourageMember
  bride: EntourageMember
}) {
  const initial = (name: string) => name.trim().charAt(0).toUpperCase()
  return (
    <motion.div className="text-center" variants={stagger(0.12)} initial="hidden" whileInView="show" viewport={IN_VIEW}>
      <motion.div variants={rise}>
        <CouplePromiseMark kicker={kicker} line={line} />
      </motion.div>
      <motion.h3 variants={rise} className={`${SECTION_TITLE_CLASS} mb-2 sm:mb-3`} style={{ color: NAVY }}>
        {heading}
      </motion.h3>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 sm:gap-x-5">
        <motion.div variants={fromSide(-30)} className="min-w-0">
          <AisleName member={groom} side="left" featured />
        </motion.div>
        <Monogram
          src={monogram}
          label={`${toDisplayName(groom.name)} and ${toDisplayName(bride.name)} monogram`}
          fallback={
            <span className={`${theSeasons.className} text-2xl sm:text-4xl`} style={{ color: NAVY }}>
              {initial(groom.name)} &amp; {initial(bride.name)}
            </span>
          }
        />
        <motion.div variants={fromSide(30)} className="min-w-0">
          <AisleName member={bride} side="right" featured />
        </motion.div>
      </div>
    </motion.div>
  )
}

export function Entourage({ sponsorsList }: { sponsorsList?: SponsorsList } = {}) {
  const sponsorsPath = sponsorsUrl(sponsorsList)
  const siteConfig = useSiteConfig()
  const content = siteConfig.entourage
  const { decos } = content
  const groomName = siteConfig.couple.groom
  const brideName = siteConfig.couple.bride
  const [entourage, setEntourage] = useState<EntourageMember[]>([])
  const [sponsors, setSponsors] = useState<PrincipalSponsor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [archRef, archSize] = useElementSize<HTMLDivElement>()
  const reduceMotion = useReducedMotion()
  // The runner unrolls down the aisle as the card scrolls past
  const { scrollYProgress } = useScroll({ target: cardRef, offset: ["start 0.8", "end 0.9"] })
  const runnerUnroll = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 })

  const loadParty = async (signal?: AbortSignal, { reload = false } = {}) => {
    const cached = readCachedParty(sponsorsPath)
    const hasCached = cached.members.length > 0
    if (hasCached) {
      // Show the last known list right away; refresh quietly in the background
      setEntourage(cached.members)
      setSponsors(cached.sponsors)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }
    setError(null)
    setIsRetrying(false)

    try {
      const [members, sponsorList] = await Promise.all([
        fetchUntilReady({
          signal,
          load: (s) => loadEntourageFromApi(s, reload),
          isReady: (list) => list.length > 0,
          maxAttempts: 4,
          maxDelayMs: 3000,
          onRetry: () => setIsRetrying(true),
        }),
        loadSponsorsFromApi(sponsorsPath, signal, reload),
      ])
      if (signal?.aborted) return
      setEntourage(members)
      setSponsors(sponsorList)
      setError(null)
    } catch (err: unknown) {
      if (isAbortError(err)) return
      console.error("Failed to load entourage:", err)
      if (!hasCached) setError("Unable to load entourage")
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
        setIsRetrying(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadParty(controller.signal)

    let updateTimer: ReturnType<typeof setTimeout> | undefined
    const handleEntourageUpdate = () => {
      clearTimeout(updateTimer)
      updateTimer = setTimeout(() => {
        void loadParty(controller.signal, { reload: true })
      }, 1000)
    }

    window.addEventListener("entourageUpdated", handleEntourageUpdate)

    return () => {
      controller.abort()
      clearTimeout(updateTimer)
      window.removeEventListener("entourageUpdated", handleEntourageUpdate)
    }
  }, [])

  // Group entourage by role category
  const grouped = useMemo(() => {
    const grouped: Record<string, EntourageMember[]> = {}
    
    entourage.forEach((member) => {
      const category = normalizeRoleCategory(member.roleCategory)

      if (!category || category === "Other") {
        return
      }
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(member)
    })
    
    return grouped
  }, [entourage])

  // Headings can be renamed in content/site.ts → entourage.headingLabels
  const headingLabels = content.headingLabels
  const chapters = useMemo(
    () => buildChapters(grouped, sponsors, (heading) => headingLabels[heading] ?? heading),
    [grouped, sponsors, headingLabels],
  )
  const label = (heading: string) => headingLabels[heading] ?? heading

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`${theSeasons.variable} ${aboveTheBeyond.variable} relative w-full overflow-hidden`}
      style={{ background: sectionBg }}
    >
      {/* Same circle pattern as the gallery */}
      <PlainBubbles />
      {/* Pink paper wash + grain and rising hearts, same as the love story (section-backdrop.tsx) */}
      <SectionBackdrop />
      <Section
        id="entourage"
        className="relative z-10 overflow-hidden pt-5 pb-5 sm:pt-10 sm:pb-10 md:pt-12 md:pb-12 lg:pt-14 lg:pb-14"
      >
        {/* Corner florals + double border (content/site.ts → entourage.decos / showFrame) */}
        {content.showFrame && <div className="deco-frame" aria-hidden="true" />}
        <DecoCorners decos={decos} />

      <motion.div
        className="relative z-20 mx-auto mb-5 max-w-5xl px-3 text-center @container/entourage sm:mb-10 sm:px-4 md:mb-12"
        variants={stagger(0.12)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        <motion.div variants={popIn()}>
          <DecoImg
            src={decos.headerOrnament}
            className="mx-auto mb-2 block h-auto w-20 select-none sm:mb-4 sm:w-36 md:w-44"
          />
        </motion.div>
        <motion.div variants={rise} className="mx-auto mb-2.5 sm:mb-5 md:mb-6">
          <OutsideDivider />
        </motion.div>
        <motion.p
          variants={rise}
          className={`${cinzel.className} mx-auto max-w-[20rem] px-2 text-[0.6875rem] font-semibold leading-snug tracking-[0.12em] min-[400px]:max-w-none min-[400px]:text-[0.75rem] min-[400px]:tracking-[0.16em] sm:text-[0.8125rem] sm:tracking-[0.2em] md:text-sm md:tracking-[0.22em]`}
          style={onBg}
        >
          {content.eyebrow}
        </motion.p>
        <motion.div variants={rise} className="mx-auto mt-2 sm:mt-4 md:mt-5">
          <EntourageTitle title={content.title} subtitle={content.subtitle} />
        </motion.div>

        <motion.p
          variants={rise}
          className="font-goudy-italic mx-auto mt-2.5 max-w-xl px-2 text-[0.78rem] leading-snug sm:mt-5 sm:text-base sm:leading-relaxed md:mt-6"
          style={{ ...onBg, fontWeight: 600 }}
        >
          {content.description}
        </motion.p>

        <div className="mt-3 flex items-center justify-center sm:mt-5">
          <motion.span
            variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.9, ease: EASE } } }}
            className="h-px w-16 sm:w-24 md:w-32"
            style={onBgLineStyle}
          />
        </div>
      </motion.div>

      <motion.div
        className="relative z-20 mx-auto max-w-3xl px-2.5 pb-1 sm:max-w-4xl sm:px-6 md:px-8 @container/entourage-card"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.05 }}
        transition={{ duration: 1, ease: EASE }}
      >
        <div ref={cardRef} className="relative">
          <ArchGarland src={decos.archGarland} />
          <div
            ref={archRef}
            className="relative z-20 overflow-hidden rounded-t-full"
            style={cardStyle}
          >
            {/* Paper grain, light through the doorway, the self-drawing arch frame */}
            <div
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.07] mix-blend-multiply"
              style={{ backgroundImage: PAPER_GRAIN }}
              aria-hidden
            />
            <DoorwayLight />
            <ArchFrame width={archSize.width} height={archSize.height} />
            <LaceEyelets />
            {/* Soft runner down the middle of the card — the aisle — and a deeper
                runner that unrolls over it as you scroll */}
            <div
              className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-16 -translate-x-1/2 sm:w-28"
              aria-hidden
            >
              <div className="absolute inset-0" style={{ background: RUNNER }} />
              <motion.div
                className="absolute inset-0 origin-top"
                style={{
                  background: RUNNER_UNROLLED,
                  maskImage: "linear-gradient(to bottom, black 85%, transparent)",
                  WebkitMaskImage: "linear-gradient(to bottom, black 85%, transparent)",
                  scaleY: reduceMotion ? 1 : runnerUnroll,
                }}
              />
            </div>

            {!isLoading && !error && <PetalShower height={archSize.height} />}

            <div className="relative z-20 px-3 pb-24 pt-[18%] sm:px-8 sm:pt-[22%] sm:pb-32 md:px-12 md:pb-36 lg:px-14">
            {isLoading ? (
              <div className="flex items-center justify-center py-24 sm:py-28 md:py-32">
                <div className="text-center">
                  <p className={`font-goudy-italic ${ct.body}`} style={{ color: palette.body }}>
                    {isRetrying ? content.retryingText : content.loadingText}
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-24 sm:py-28 md:py-32">
                <div className="text-center">
                  <p className={`font-goudy-italic ${ct.bodyLg} mb-3`} style={{ color: palette.body }}>
                    {content.errorText}
                  </p>
                  <button
                    onClick={() => void loadParty(undefined, { reload: true })}
                    className={`${cinzel.className} ${ct.body} underline transition-colors duration-200 hover:opacity-80`}
                    style={{ color: palette.accent }}
                  >
                    {content.retryText}
                  </button>
                </div>
              </div>
            ) : (
            <>
              <CoupleAtTheAltar
                heading={label(content.coupleHeading)}
                kicker={content.coupleKicker}
                line={content.coupleLine}
                monogram={siteConfig.couple.monogram}
                groom={{ name: groomName, roleCategory: "The Couple", roleTitle: content.groomRole, email: "" }}
                bride={{ name: brideName, roleCategory: "The Couple", roleTitle: content.brideRole, email: "" }}
              />
              {chapters.map((chapter, index) => (
                <AisleChapter key={chapter.key} chapter={chapter} numeral={toRoman(index + 1)} />
              ))}
              <AisleEnd />
            </>
            )}
            </div>
          </div>
          <LaceHem />
          <CornerBouquet src={decos.cornerBouquet} side="left" />
          <CornerBouquet src={decos.cornerBouquet} side="right" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={IN_VIEW}
          transition={{ duration: 1, ease: EASE }}
        >
          <DecoImg
            src={decos.footerVine}
            className="relative z-20 mx-auto mt-6 block h-auto w-40 select-none opacity-90 sm:mt-12 sm:w-72 md:w-96"
          />
        </motion.div>
      </motion.div>
      </Section>
    </div>
    </MotionConfig>
  )
}