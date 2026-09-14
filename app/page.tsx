"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cpu,
  CreditCard,
  Database,
  FileSpreadsheet,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  School,
  ShieldCheck,
  Star,
  UserCog,
  Users,
  Wallet,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useInView } from "framer-motion"
import { useRef, useState } from "react"

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

/**
 * Centred page gutter.
 *
 * Tailwind v4's `container` sets max-widths but does not centre or pad, so the old
 * `container px-4` markup left every section flush against the left edge of a wide screen.
 * One wrapper keeps the header, the hero and every section on the same measure.
 */
function Shell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
}

function AnimatedSection({ children, className, ...props }: React.ComponentPropsWithoutRef<typeof motion.section>) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.15 })

  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeIn}
      className={className}
      {...props}
    >
      {children}
    </motion.section>
  )
}

/** Section eyebrow, so every section opens the same way. */
function SectionIntro({
  eyebrow,
  heading,
  children,
}: {
  eyebrow: string
  heading: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </span>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h2>
      {children && <p className="text-base text-muted-foreground sm:text-lg">{children}</p>}
    </div>
  )
}

/**
 * The modules the platform actually ships, in the order a school sets them up: people
 * first, then the academic year, then the money. Naming a module the product does not have
 * is the fastest way to lose an enterprise buyer during the demo.
 */
const MODULES = [
  {
    icon: GraduationCap,
    title: "Student Management",
    description: "Admissions, biodata, guardians, class placement and term-to-term transitions.",
  },
  {
    icon: UserCog,
    title: "Teacher Management",
    description: "Staff records, subject and class assignments, and per-teacher permissions.",
  },
  {
    icon: Users,
    title: "Parent Portal",
    description: "Guardians linked to their children, with results and fee statements on demand.",
  },
  {
    icon: BookOpen,
    title: "Classes & Subjects",
    description: "Class arms, subject offerings, and the class-term structure everything hangs on.",
  },
  {
    icon: CalendarRange,
    title: "Sessions & Terms",
    description: "One current term the whole system follows, so nothing lands in the wrong period.",
  },
  {
    icon: ClipboardList,
    title: "Results Compiler",
    description: "CA and exam entry, positions, and report cards on your school letterhead.",
  },
  {
    icon: CalendarDays,
    title: "School Calendar",
    description: "Term dates, exam periods, holidays and events, shared across every role.",
  },
  {
    icon: Wallet,
    title: "Finance & Fees",
    description: "Fee schedules, student charges, discounts and exemptions, tracked by class.",
  },
  {
    icon: ReceiptText,
    title: "Receipts & Statements",
    description: "Numbered receipts, a searchable register, and a printable student statement.",
  },
  {
    icon: Landmark,
    title: "Expenditure Control",
    description: "Vouchers from draft to approval to payment, set against category budgets.",
  },
  {
    icon: Briefcase,
    title: "HR & Payroll",
    description: "Salary scales, allowances and deductions, monthly runs and payslips.",
  },
  {
    icon: FileSpreadsheet,
    title: "Reports & Exports",
    description: "Every report prints on your letterhead and exports to PDF or spreadsheet.",
  },
]

/** Claims about what is built, not invented adoption numbers. */
const HERO_STATS = [
  { icon: LayoutDashboard, label: "12 integrated modules" },
  { icon: ShieldCheck, label: "6 role-based dashboards" },
  { icon: FileSpreadsheet, label: "Print & PDF on your letterhead" },
]

const ENTERPRISE_POINTS = [
  {
    icon: ShieldCheck,
    title: "Permission-based access",
    description:
      "Six roles, each with its own dashboard and its own permissions. An accountant never sees score entry; a teacher never sees payroll.",
  },
  {
    icon: Landmark,
    title: "Multi-school ready",
    description:
      "One deployment can carry a group of schools, each with its own students, fees, numbering and branding, kept apart at the database level.",
  },
  {
    icon: ReceiptText,
    title: "An audit trail that holds",
    description:
      "Receipts are numbered per school and per year, vouchers record who approved and who paid, and every adjustment keeps its reason.",
  },
  {
    icon: FileSpreadsheet,
    title: "Paper that looks official",
    description:
      "Report cards, receipts, vouchers and payslips all carry the same masthead — your logo, name, address and contact line.",
  },
]

export default function SchoolLandingPage() {
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [contact, setContact] = useState({ name: "", email: "", subject: "", message: "" })

  const handleSignIn = () => {
    setIsSigningIn(true)
    setTimeout(() => router.push("/auth/login"), 300)
  }

  /**
   * There is no marketing mail backend, so the form hands the enquiry to the visitor's own
   * mail client rather than appearing to submit and losing it.
   */
  const sendEnquiry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const subject = encodeURIComponent(contact.subject || `Enquiry from ${contact.name || "a school"}`)
    const body = encodeURIComponent(
      [contact.message, "", `Name: ${contact.name}`, `Email: ${contact.email}`].filter(Boolean).join("\n"),
    )
    window.location.href = `mailto:digisoft10@gmail.com?subject=${subject}&body=${body}`
  }

  const expertProgrammers = [
    {
      name: "Michael Chen",
      role: "DevOps Engineer",
      expertise: "AWS, Docker, CI/CD Pipelines",
      experience: "7+ years",
      icon: <Cpu className="h-8 w-8 text-primary" />,
    },
    {
      name: "Abubakar Sadiq Abdullahi",
      role: "Full Stack Developer",
      expertise: "React, Node.js, Next.js, PostgreSQL, TypeScript, C#, .NET, Express.js, PHP, Laravel",
      experience: "8+ years",
      icon: (
        <Image
          src="/HumSad.jpeg"
          alt="Abubakar Sadiq Abdullahi"
          width={96}
          height={96}
          className="h-full w-full rounded-full object-cover"
        />
      ),
    },
    {
      name: "Jessica Williams",
      role: "Database Architect",
      expertise: "SQL, MongoDB, Data Optimization",
      experience: "9+ years",
      icon: <Database className="h-8 w-8 text-primary" />,
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header: a floating pill over the hero, the way the GSU site carries its nav. */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 z-50 w-full py-3"
      >
        <Shell>
          <div className="flex items-center justify-between gap-4 rounded-full border border-white/15 bg-slate-950/60 px-4 py-2 shadow-lg backdrop-blur-md sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                <School className="h-5 w-5 text-primary-foreground" />
              </span>
              <span className="text-lg font-bold tracking-tight">DigiSchool-Pro</span>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {[
                { href: "#modules", label: "Modules" },
                { href: "#enterprise", label: "Why Us" },
                { href: "#programmers", label: "Our Team" },
                { href: "#pricing", label: "Registration" },
                { href: "#contact", label: "Contact" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <Button size="sm" onClick={handleSignIn} disabled={isSigningIn} className="min-w-[92px] rounded-full">
              {isSigningIn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Loading</span>
                </>
              ) : (
                <>
                  Sign In <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </Shell>
      </motion.header>

      {/* Hero */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
        <Image src="/landingpage.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        {/* Two layers: a flat wash for legibility, then a vignette so the edges settle. */}
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/55 to-slate-950" />

        <Shell className="relative z-10 py-28 text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur sm:text-sm"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Enterprise School Management Platform
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mx-auto mt-8 max-w-5xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            Run Your Entire School
            <span className="relative mt-3 block text-primary">
              On One Platform
              {/* Hand-drawn rule under the accent line, as on the GSU hero. */}
              <svg
                aria-hidden
                viewBox="0 0 400 16"
                preserveAspectRatio="none"
                className="mx-auto mt-2 h-3 w-[min(90%,26rem)] text-primary"
              >
                <path
                  d="M2 11C70 4 150 3 200 6c50 3 130 4 198 -2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mx-auto mt-8 max-w-2xl text-base text-white/80 sm:text-lg"
          >
            Students, staff, results, fees, expenditure and payroll in a single system — with role-based dashboards for
            every office and reports that print on your own letterhead.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button size="lg" onClick={handleSignIn} disabled={isSigningIn} className="min-w-[200px] rounded-full">
              {isSigningIn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
                </>
              ) : (
                <>
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-w-[200px] rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href="#modules">Explore the Platform</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-4"
          >
            {HERO_STATS.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="flex items-center gap-2 text-sm text-white/85">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="font-medium">{stat.label}</span>
                </div>
              )
            })}
          </motion.div>
        </Shell>

        <Link
          href="#modules"
          className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white"
        >
          Scroll
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </Link>
      </section>

      {/* Modules */}
      <AnimatedSection id="modules" className="w-full scroll-mt-24 bg-muted/30 py-20 md:py-28">
        <Shell>
          <SectionIntro eyebrow="Modules" heading="Everything your school runs on">
            Twelve modules that share one set of students, one academic calendar and one ledger — so the result sheet,
            the receipt and the payroll all agree with each other.
          </SectionIntro>

          {/* Four across on a wide screen: twelve cards land as a tidy 4x3 block, and each
              card stays small enough to scan rather than read. */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {MODULES.map((module) => {
              const Icon = module.icon
              return (
                <motion.div key={module.title} variants={itemVariant}>
                  <div className="group h-full rounded-xl border border-border/70 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)]">
                    {/* A fixed chip keeps every icon on the same baseline across the grid. */}
                    <div className="mb-3.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15 transition-colors group-hover:bg-primary group-hover:ring-primary">
                      <Icon className="h-4 w-4 text-primary transition-colors group-hover:text-primary-foreground" />
                    </div>
                    <h3 className="text-sm font-semibold tracking-tight">{module.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{module.description}</p>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </Shell>
      </AnimatedSection>

      {/* Enterprise credentials */}
      <AnimatedSection id="enterprise" className="w-full scroll-mt-24 py-20 md:py-28">
        <Shell>
          <SectionIntro eyebrow="Built for scale" heading="Why groups and boards choose it">
            The things that decide a school-management purchase are rarely on the feature list. These are the four that
            usually settle it.
          </SectionIntro>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-14 grid gap-6 md:grid-cols-2"
          >
            {ENTERPRISE_POINTS.map((point) => {
              const Icon = point.icon
              return (
                <motion.div key={point.title} variants={itemVariant}>
                  <div className="flex h-full items-start gap-4 rounded-xl border bg-card p-6 transition-shadow hover:shadow-md">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-semibold">{point.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{point.description}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </Shell>
      </AnimatedSection>

      {/* Team */}
      <AnimatedSection id="programmers" className="w-full scroll-mt-24 bg-muted/30 py-20 md:py-28">
        <Shell>
          <SectionIntro eyebrow="Our Team" heading="The people who build it">
            The platform is built and maintained by a small team of engineers you can actually reach.
          </SectionIntro>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mx-auto mt-14 grid max-w-6xl gap-6 md:grid-cols-3"
          >
            {expertProgrammers.map((programmer) => (
              <motion.div
                key={programmer.name}
                variants={itemVariant}
                whileHover={{ y: -5 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="h-full transition-all duration-300 hover:shadow-lg">
                  <CardHeader className="flex flex-col items-center gap-3 text-center">
                    {/* h-24 w-24, not the old w-30 — Tailwind has no 30 step on the spacing
                        scale, so that class did nothing and the avatars collapsed. */}
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                      {programmer.icon}
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-base">{programmer.name}</CardTitle>
                      <CardDescription className="font-medium text-primary">{programmer.role}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-muted-foreground">{programmer.expertise}</p>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {programmer.experience}
                    </span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </Shell>
      </AnimatedSection>

      {/* Testimonials */}
      <AnimatedSection className="w-full py-20 md:py-28">
        <Shell>
          <SectionIntro eyebrow="Our Teachers" heading="Hear from our educators">
            Teachers use DigiSchool-Pro every day to manage their classes and follow student progress.
          </SectionIntro>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-2"
          >
            {[
              {
                quote:
                  "DigiSchool-Pro has transformed how I manage my classroom. The attendance tracking and grade management features save me hours each week, allowing me to focus more on teaching.",
                name: "Mrs. Emily Johnson",
                role: "Mathematics Teacher, Lincoln High School",
              },
              {
                quote:
                  "As a department head, DigiSchool-Pro helps me coordinate with other teachers, track curriculum progress, and ensure we are meeting educational standards. It is an essential tool for our school.",
                name: "Mr. David Rodriguez",
                role: "Science Department Head, Washington Academy",
              },
            ].map((testimonial) => (
              <motion.div key={testimonial.name} variants={itemVariant}>
                <Card className="flex h-full flex-col transition-all duration-300 hover:shadow-lg">
                  <CardHeader className="pb-2">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, index) => (
                        <Star key={index} className="h-4 w-4 fill-primary text-primary" />
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="leading-relaxed text-muted-foreground">{testimonial.quote}</p>
                  </CardContent>
                  <CardFooter>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{testimonial.name}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </Shell>
      </AnimatedSection>

      {/* Registration, schedule and fees */}
      <AnimatedSection id="pricing" className="w-full scroll-mt-24 bg-muted/30 py-20 md:py-28">
        <Shell>
          <SectionIntro eyebrow="School Information" heading="Registration, schedule and fees">
            What a parent needs before joining the school community, and what the office needs to run it.
          </SectionIntro>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-3"
          >
            {[
              {
                icon: GraduationCap,
                title: "Registration",
                description: "Student enrollment process and requirements.",
                items: [
                  "Online application form",
                  "Required documents",
                  "Admission testing",
                  "Parent interviews",
                  "Enrollment confirmation",
                ],
                cta: "Apply Now",
              },
              {
                icon: CalendarDays,
                title: "Schedule",
                description: "Academic calendar and daily schedules.",
                items: [
                  "School year calendar",
                  "Class schedules",
                  "Exam periods",
                  "Holiday breaks",
                  "Extracurricular activities",
                ],
                cta: "View Schedule",
              },
              {
                icon: CreditCard,
                title: "School Fees",
                description: "Tuition and additional costs information.",
                items: [
                  "Tuition fees",
                  "Registration fee",
                  "Books and materials",
                  "Payment plans",
                  "Scholarships available",
                  "Financial aid options",
                ],
                cta: "Fee Structure",
              },
            ].map((panel) => {
              const Icon = panel.icon
              return (
                <motion.div key={panel.title} variants={itemVariant} whileHover={{ y: -6 }} transition={{ duration: 0.25 }}>
                  <Card className="flex h-full flex-col transition-all duration-300 hover:shadow-lg">
                    <CardHeader>
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle>{panel.title}</CardTitle>
                      <CardDescription>{panel.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <ul className="space-y-2 text-sm">
                        {panel.items.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" onClick={handleSignIn} disabled={isSigningIn}>
                        {panel.cta}
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        </Shell>
      </AnimatedSection>

      {/* Contact */}
      <AnimatedSection id="contact" className="w-full scroll-mt-24 py-20 md:py-28">
        <Shell>
          <SectionIntro eyebrow="Contact Us" heading="Get in touch">
            Tell us about your school and we will show you the platform running with your own structure.
          </SectionIntro>

          {/* Details beside the form rather than stacked above it: the enquiry is the point
              of the section, so it sits at eye level instead of below three cards. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-sm"
          >
            <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
              {/* Dark rail, so the contact details read as a letterhead rather than a list. */}
              <div className="relative flex flex-col justify-between gap-8 bg-slate-950 p-8 text-white">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/25 blur-3xl"
                />
                <div className="relative space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Talk to us</h3>
                    <p className="text-sm leading-relaxed text-white/70">
                      Reach the team directly, or send the form and we will come back with a walkthrough of your own
                      structure.
                    </p>
                  </div>

                  <div className="space-y-5">
                    {[
                      {
                        icon: Phone,
                        label: "Phone",
                        value: "+234-803-923-3431",
                        hint: "Mon-Fri, 8am to 5pm",
                        href: "tel:+2348039233431",
                      },
                      {
                        icon: Mail,
                        label: "Email",
                        value: "digisoft10@gmail.com",
                        hint: "We reply within a working day",
                        href: "mailto:digisoft10@gmail.com",
                      },
                      {
                        icon: MapPin,
                        label: "Office",
                        value: "Suit No. 4, Junaidu Plaza, Biu bye-pass road",
                        hint: "Gombe, Gombe State",
                      },
                    ].map((item) => {
                      const Icon = item.icon
                      const body = (
                        <>
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                              {item.label}
                            </p>
                            <p className="text-sm font-medium leading-snug">{item.value}</p>
                            <p className="text-xs text-white/55">{item.hint}</p>
                          </div>
                        </>
                      )

                      return item.href ? (
                        <a
                          key={item.label}
                          href={item.href}
                          className="flex items-start gap-3 rounded-lg transition-opacity hover:opacity-80"
                        >
                          {body}
                        </a>
                      ) : (
                        <div key={item.label} className="flex items-start gap-3">
                          {body}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <p className="relative text-xs text-white/45">
                  Built and supported in Gombe, Nigeria — for Nigerian school calendars, terms and fee structures.
                </p>
              </div>

              <form className="space-y-4 p-8" onSubmit={sendEnquiry}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="block text-sm font-medium">
                      Name
                    </label>
                    <input
                      id="name"
                      required
                      value={contact.name}
                      onChange={(event) => setContact({ ...contact, name: event.target.value })}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Your name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-medium">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={contact.email}
                      onChange={(event) => setContact({ ...contact, email: event.target.value })}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="you@school.edu.ng"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="subject" className="block text-sm font-medium">
                    School name
                  </label>
                  <input
                    id="subject"
                    value={contact.subject}
                    onChange={(event) => setContact({ ...contact, subject: event.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Which school are you enquiring for?"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="message" className="block text-sm font-medium">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    required
                    value={contact.message}
                    onChange={(event) => setContact({ ...contact, message: event.target.value })}
                    className="w-full resize-y rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="How many students and staff, and which modules matter most?"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full rounded-lg">
                  Send Message <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Opens in your mail app, addressed to digisoft10@gmail.com.
                </p>
              </form>
            </div>
          </motion.div>
        </Shell>
      </AnimatedSection>

      {/* Closing call to action */}
      <AnimatedSection className="w-full pb-20 md:pb-28">
        <Shell>
          <div className="relative overflow-hidden rounded-2xl bg-slate-950 px-8 py-14 text-center text-white sm:px-14">
            {/* Two soft lights instead of a flat panel — the cheapest way to make a dark
                band read as premium rather than empty. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
            />
            <div className="relative mx-auto max-w-2xl space-y-5">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                See it running with your own school
              </h2>
              <p className="text-white/70">
                We will load a term, a class list and a fee schedule that look like yours, then walk your team through
                the offices that will use it every day.
              </p>
              <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
                <Button size="lg" asChild className="min-w-[190px] rounded-full">
                  <Link href="#contact">
                    Book a Walkthrough <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="min-w-[190px] rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Shell>
      </AnimatedSection>

      {/* Footer */}
      <footer className="w-full border-t bg-muted/20 py-12">
        <Shell>
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                  <School className="h-5 w-5 text-primary-foreground" />
                </span>
                <span className="text-xl font-bold">DigiSchool-Pro</span>
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Empowering schools with modern management tools to enhance education and streamline administration.
              </p>
            </div>
            {[
              { heading: "Platform", items: ["Modules", "Registration", "Schedule", "School Fees", "Support"] },
              { heading: "School", items: ["About Us", "Faculty", "Curriculum", "Events", "Contact"] },
              { heading: "Legal", items: ["Terms", "Privacy", "Cookies", "Accessibility", "Settings"] },
            ].map((column) => (
              <div key={column.heading}>
                <h3 className="mb-4 text-sm font-semibold">{column.heading}</h3>
                <ul className="space-y-2 text-sm">
                  {column.items.map((item) => (
                    <li key={item}>
                      <Link href="#" className="text-muted-foreground transition-colors hover:text-foreground">
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} DigiSchool-Pro. All rights reserved.
            </p>
            <div className="flex gap-4">
              {["Facebook", "Twitter", "Instagram", "YouTube"].map((social) => (
                <Link
                  key={social}
                  href="#"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {social}
                </Link>
              ))}
            </div>
          </div>
        </Shell>
      </footer>
    </div>
  )
}
