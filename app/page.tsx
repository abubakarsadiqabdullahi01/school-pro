"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Book, Calendar, ChevronRight, GraduationCap, Loader2, School, Star, Users, Mail, Phone, MapPin, Code, Cpu, Database, Cloud, Shield, Zap, CreditCard } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useInView } from "framer-motion"
import { useRef, useState } from "react"

// Animation variants
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
}

const itemVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeIn}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export default function SchoolLandingPage() {
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleSignIn = () => {
    setIsSigningIn(true)
    // Simulate a slight delay before navigation for better UX
    setTimeout(() => {
      router.push("/auth/login")
    }, 300)
  }

  // Expert programmers data
  const expertProgrammers = [
    
    {
      name: "Michael Chen",
      role: "DevOps Engineer",
      expertise: "AWS, Docker, CI/CD Pipelines",
      experience: "7+ years",
      icon: <Cpu className="h-6 w-6" />
    },
    {
      name: "Abubakar Sadiq Abdullahi",
      role: "Full Stack Developer",
      expertise: "React, Node.js, Next.js, PostgreSQL, TypeScript, C#, .NET, Express.js, Php, Laravel",
      experience: "8+ years",
      icon: (
        <Image
          src="/HumSad.jpeg"
          alt="Abubakar Sadiq Abdullahi"
          width={100}
          height={100}
          className="rounded-full object-cover"
        />
      )
    },
    {
      name: "Jessica Williams",
      role: "Database Architect",
      expertise: "SQL, MongoDB, Data Optimization",
      experience: "9+ years",
      icon: <Database className="h-6 w-6" />
    }
  ]

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <School className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">SchoolPro</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <Link href="#features" className="text-sm font-medium hover:text-primary transition-colors">
              Features
            </Link>
            <Link href="#programmers" className="text-sm font-medium hover:text-primary transition-colors">
              Our Team
            </Link>
            <Link href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">
              Registration
            </Link>
            <Link href="#contact" className="text-sm font-medium hover:text-primary transition-colors">
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <motion.div whileHover={!isSigningIn ? { scale: 1.05 } : {}} whileTap={!isSigningIn ? { scale: 0.95 } : {}}>
              <Button size="sm" onClick={handleSignIn} disabled={isSigningIn} className="min-w-[80px] transition-all">
                {isSigningIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <AnimatedSection className="w-full py-12 md:py-24  bg-gradient-to-b from-background to-muted/30">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.2 }}
                  className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
                >
                  Modern School Management
                  <span className="block text-primary mt-2">Reimagined</span>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.4 }}
                  className="max-w-[600px] text-muted-foreground md:text-xl"
                >
                  The comprehensive platform that helps schools manage students, teachers, classes, and administrative
                  tasks efficiently with cutting-edge technology.
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.6 }}
                className="flex flex-col gap-2 min-[400px]:flex-row"
              >
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button size="lg" className="gap-1">
                    Get Started <ChevronRight className="h-4 w-4" />
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={!isSigningIn ? { scale: 1.05 } : {}}
                  whileTap={!isSigningIn ? { scale: 0.95 } : {}}
                >
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleSignIn}
                    disabled={isSigningIn}
                    className="min-w-[120px] transition-all"
                  >
                    {isSigningIn ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </motion.div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.8 }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <School className="h-4 w-4 text-primary" /> Trusted by 500+ schools worldwide
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="relative w-full h-[260px] sm:h-[360px] lg:h-[420px] rounded-xl overflow-hidden shadow-2xl flex items-center justify-center bg-gradient-to-tr from-sky-600 via-indigo-600 to-slate-700"
              >
                <div className="flex flex-col items-center justify-center text-center text-slate-50 px-5 sm:px-8">
                  <div className="rounded-xl bg-white/8 p-4 sm:p-6 backdrop-blur-sm shadow-md">
                    {/* File with code icon (inline SVG) */}
                    <svg
                      role="img"
                      aria-label="File with code icon"
                      viewBox="0 0 48 48"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-16 sm:h-20 lg:h-24 w-auto"
                    >
                      <rect x="4" y="6" width="40" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
                      <path d="M16 20l-4 4 4 4" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M32 20l4 4-4 4" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 12h12" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M12 16h24" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-semibold leading-tight">
                      SchoolPro Premium
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm lg:text-base text-slate-100/90 max-w-xl">
                      Upgrade for advanced analytics, priority support and customizable reports tailored to your school's structure.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>

      {/* Features Section */}
      <AnimatedSection id="features" className="w-full bg-muted/30">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary px-3 py-1 text-sm text-primary-foreground">
                Features
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Everything your school needs</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Our platform provides all the tools you need to manage your school efficiently, from student records to
                class scheduling and beyond.
              </p>
            </div>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mx-auto grid max-w-5xl items-center gap-6 py-12 lg:grid-cols-3"
          >
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card className="h-full transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <Book className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Student Management</CardTitle>
                  <CardDescription>
                    Easily manage student records, attendance, grades, and performance tracking in one centralized
                    system.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card className="h-full transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Teacher Management</CardTitle>
                  <CardDescription>
                    Streamline teacher scheduling, performance evaluations, and professional development tracking.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card className="h-full transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Class Scheduling</CardTitle>
                  <CardDescription>
                    Create and manage class schedules, room assignments, and academic calendars with ease.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* Expert Programmers Section */}
      <AnimatedSection id="programmers" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary px-3 py-1 text-sm text-primary-foreground">
                Our Team
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Expert Developers</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Meet the brilliant minds behind SchoolPro's powerful platform
              </p>
            </div>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mx-auto grid max-w-6xl gap-6 py-12 md:grid-cols-2 lg:grid-cols-3"
          >
            {expertProgrammers.map((programmer, index) => (
              <motion.div key={index} variants={itemVariant} whileHover={{ y: -5, transition: { duration: 0.3 } }}>
                <Card className="h-full transition-all duration-300 hover:shadow-lg">
                  <CardHeader className="flex flex-col items-center text-center">
                    <div className="flex items-center justify-center w-30 h-30 rounded-full bg-primary/10 mb-4">
                      {programmer.icon}
                    </div>
                    <CardTitle>{programmer.name}</CardTitle>
                    <CardDescription className="text-primary font-medium">{programmer.role}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">{programmer.expertise}</p>
                    <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary">
                      {programmer.experience}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </AnimatedSection>

      {/* Testimonials Section */}
      <AnimatedSection className="w-full py-12 md:py-24 lg:py-32 bg-muted/30">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary px-3 py-1 text-sm text-primary-foreground">
                Our Teachers
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Hear from our educators</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Our teachers love using SchoolPro to manage their classes and student progress.
              </p>
            </div>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mx-auto grid max-w-5xl gap-6 py-12 lg:grid-cols-2"
          >
            <motion.div variants={itemVariant}>
              <Card className="transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ staggerChildren: 0.1, delayChildren: 0.3 }}
                      className="flex"
                    >
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                        >
                          <Star className="h-4 w-4 fill-primary text-primary" />
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    "SchoolPro has transformed how I manage my classroom. The attendance tracking and grade management
                    features save me hours each week, allowing me to focus more on teaching."
                  </p>
                </CardContent>
                <CardFooter>
                  <div className="flex items-center gap-4">
                    <div className="rounded-full h-10 w-10 bg-primary/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Mrs. Emily Johnson</p>
                      <p className="text-xs text-muted-foreground">Mathematics Teacher, Lincoln High School</p>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant}>
              <Card className="transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ staggerChildren: 0.1, delayChildren: 0.3 }}
                      className="flex"
                    >
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                        >
                          <Star className="h-4 w-4 fill-primary text-primary" />
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    "As a department head, SchoolPro helps me coordinate with other teachers, track curriculum progress,
                    and ensure we're meeting educational standards. It's an essential tool for our school."
                  </p>
                </CardContent>
                <CardFooter>
                  <div className="flex items-center gap-4">
                    <div className="rounded-full h-10 w-10 bg-primary/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium">Mr. David Rodriguez</p>
                      <p className="text-xs text-muted-foreground">Science Department Head, Washington Academy</p>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* Pricing Section (Registration, Schedule, School Fees) */}
      <AnimatedSection id="pricing" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary px-3 py-1 text-sm text-primary-foreground">
                School Information
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Registration, Schedule & Fees</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Everything you need to know about joining our school community.
              </p>
            </div>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mx-auto grid max-w-5xl gap-6 py-12 lg:grid-cols-3"
          >
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card className="h-full transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <GraduationCap className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Registration</CardTitle>
                  <CardDescription>Student enrollment process and requirements.</CardDescription>
                </CardHeader>
                <CardContent>
                  <motion.ul
                    variants={staggerContainer}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="space-y-2 text-sm"
                  >
                    {[
                      "Online application form",
                      "Required documents",
                      "Admission testing",
                      "Parent interviews",
                      "Enrollment confirmation",
                    ].map((feature, i) => (
                      <motion.li key={i} variants={itemVariant} className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" /> {feature}
                      </motion.li>
                    ))}
                  </motion.ul>
                </CardContent>
                <CardFooter>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full">
                    <Button className="w-full">Apply Now</Button>
                  </motion.div>
                </CardFooter>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card className="h-full transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Schedule</CardTitle>
                  <CardDescription>Academic calendar and daily schedules.</CardDescription>
                </CardHeader>
                <CardContent>
                  <motion.ul
                    variants={staggerContainer}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="space-y-2 text-sm"
                  >
                    {[
                      "School year calendar",
                      "Class schedules",
                      "Exam periods",
                      "Holiday breaks",
                      "Extracurricular activities",
                    ].map((feature, i) => (
                      <motion.li key={i} variants={itemVariant} className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" /> {feature}
                      </motion.li>
                    ))}
                  </motion.ul>
                </CardContent>
                <CardFooter>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full">
                    <Button className="w-full">View Schedule</Button>
                  </motion.div>
                </CardFooter>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card className="h-full transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>School Fees</CardTitle>
                  <CardDescription>Tuition and additional costs information.</CardDescription>
                </CardHeader>
                <CardContent>
                  <motion.ul
                    variants={staggerContainer}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="space-y-2 text-sm"
                  >
                    {[
                      "Tuition fees",
                      "Registration fee",
                      "Books and materials",
                      "Payment plans",
                      "Scholarships available",
                      "Financial aid options",
                    ].map((feature, i) => (
                      <motion.li key={i} variants={itemVariant} className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" /> {feature}
                      </motion.li>
                    ))}
                  </motion.ul>
                </CardContent>
                <CardFooter>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full">
                    <Button className="w-full">Fee Structure</Button>
                  </motion.div>
                </CardFooter>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* Contact Section */}
      <AnimatedSection id="contact" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary px-3 py-1 text-sm text-primary-foreground">
                Contact Us
              </div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Get in Touch</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
              </p>
            </div>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mx-auto grid max-w-5xl gap-6 py-12 md:grid-cols-3"
          >
            <motion.div variants={itemVariant} className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold">Phone</h3>
              <p className="text-muted-foreground">+234-803-923-3431</p>
              <p className="text-sm text-muted-foreground mt-2">Mon-Fri from 8am to 5pm</p>
            </motion.div>
            
            <motion.div variants={itemVariant} className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold">Email</h3>
              <p className="text-muted-foreground">digisoft10@gmail.com</p>
              <p className="text-sm text-muted-foreground mt-2">Send us a message anytime</p>
            </motion.div>
            
            <motion.div variants={itemVariant} className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold">Office</h3>
              <p className="text-muted-foreground">Suit No. 4, Junaidu Plaza, Biu bye-pass road</p>
              <p className="text-sm text-muted-foreground mt-2">Gombe, Gombe state</p>
            </motion.div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto bg-card rounded-xl p-6 shadow-sm border"
          >
            <form className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-1">Name</label>
                  <input type="text" id="name" className="w-full px-3 py-2 border rounded-md" placeholder="Your name" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" id="email" className="w-full px-3 py-2 border rounded-md" placeholder="Your email" />
                </div>
              </div>
              <div>
                <label htmlFor="subject" className="block text-sm font-medium mb-1">Subject</label>
                <input type="text" id="subject" className="w-full px-3 py-2 border rounded-md" placeholder="Subject" />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium mb-1">Message</label>
                <textarea id="message" rows={4} className="w-full px-3 py-2 border rounded-md" placeholder="Your message"></textarea>
              </div>
              <Button type="submit" className="w-full">Send Message</Button>
            </form>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full py-6 md:py-12 border-t bg-muted/20"
      >
        <div className="container px-4 md:px-6">
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <School className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">SchoolPro</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-[300px]">
                Empowering schools with modern management tools to enhance education and streamline administration.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-4">Platform</h3>
              <ul className="space-y-2 text-sm">
                {["Features", "Registration", "Schedule", "School Fees", "Support"].map((item, i) => (
                  <li key={i}>
                    <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-4">School</h3>
              <ul className="space-y-2 text-sm">
                {["About Us", "Faculty", "Curriculum", "Events", "Contact"].map((item, i) => (
                  <li key={i}>
                    <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                {["Terms", "Privacy", "Cookies", "Accessibility", "Settings"].map((item, i) => (
                  <li key={i}>
                    <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row justify-between items-center mt-8 pt-8 border-t">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} SchoolPro. All rights reserved.
            </p>
            <div className="flex gap-4">
              {["Facebook", "Twitter", "Instagram", "YouTube"].map((social, i) => (
                <Link key={i} href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs">
                  {social}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </motion.footer>
    </div>
  )
}