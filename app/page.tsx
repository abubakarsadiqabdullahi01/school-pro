"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Book, Calendar, ChevronRight, GraduationCap, LineChart, Loader2, School, Star, Users } from "lucide-react"
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
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

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
  )
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <School className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">SchoolPro</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <Link href="#features" className="text-sm font-medium hover:text-primary">
              Features
            </Link>
            <Link href="#testimonials" className="text-sm font-medium hover:text-primary">
              Teachers
            </Link>
            <Link href="#pricing" className="text-sm font-medium hover:text-primary">
              Registration
            </Link>
            <Link href="#" className="text-sm font-medium hover:text-primary">
              About
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
      <AnimatedSection className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.2 }}
                  className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none"
                >
                  Modern School Management
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.4 }}
                  className="max-w-[600px] text-muted-foreground md:text-xl"
                >
                  The comprehensive platform that helps schools manage students, teachers, classes, and administrative
                  tasks efficiently.
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
                    Learn More <ChevronRight className="h-4 w-4" />
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
              <div className="relative w-full h-[300px] sm:h-[400px] lg:h-[500px] rounded-lg overflow-hidden shadow-xl">
                <img
                  src="/landingpage.webp"
                  alt="SchoolPro Dashboard"
                  className="object-cover w-full h-full"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>

      {/* Features Section */}
      <AnimatedSection  className="w-full py-12 md:py-24 lg:py-32 bg-muted/50">
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
              <Card>
                <CardHeader>
                  <Book className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Student Management</CardTitle>
                  <CardDescription>
                    Easily manage student records, attendance, grades, and performance tracking in one centralized
                    system.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card>
                <CardHeader>
                  <Users className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Teacher Management</CardTitle>
                  <CardDescription>
                    Streamline teacher scheduling, performance evaluations, and professional development tracking.
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant} whileHover={{ y: -10, transition: { duration: 0.3 } }}>
              <Card>
                <CardHeader>
                  <Calendar className="h-10 w-10 text-primary mb-2" />
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

      {/* Testimonials Section */}
      <AnimatedSection className="w-full py-12 md:py-24 lg:py-32">
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
              <Card>
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
                    <img
                      src="/placeholder.svg?height=40&width=40"
                      alt="Mrs. Emily Johnson"
                      className="rounded-full h-10 w-10 object-cover"
                    />
                    <div>
                      <p className="text-sm font-medium">Mrs. Emily Johnson</p>
                      <p className="text-xs text-muted-foreground">Mathematics Teacher, Lincoln High School</p>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
            <motion.div variants={itemVariant}>
              <Card>
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
                    <img
                      src="/placeholder.svg?height=40&width=40"
                      alt="Mr. David Rodriguez"
                      className="rounded-full h-10 w-10 object-cover"
                    />
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
      <AnimatedSection className="w-full py-12 md:py-24 lg:py-32 bg-muted/50">
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
              <Card>
                <CardHeader>
                  <GraduationCap className="h-10 w-10 text-primary mb-2" />
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
              <Card>
                <CardHeader>
                  <Calendar className="h-10 w-10 text-primary mb-2" />
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
              <Card>
                <CardHeader>
                  <LineChart className="h-10 w-10 text-primary mb-2" />
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

      {/* CTA Section */}
      <AnimatedSection className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Ready to transform your school?</h2>
              <p className="max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Join hundreds of schools that use SchoolPro to streamline administration and enhance education.
              </p>
            </div>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-2 min-[400px]:flex-row"
            >
              <motion.div variants={itemVariant} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="lg" className="gap-1">
                  Request Demo <ChevronRight className="h-4 w-4" />
                </Button>
              </motion.div>
              <motion.div variants={itemVariant} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="lg" variant="outline">
                  Contact Us
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full py-6 md:py-12 border-t"
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
                    <Link href="#" className="text-muted-foreground hover:text-foreground">
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
                    <Link href="#" className="text-muted-foreground hover:text-foreground">
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
                    <Link href="#" className="text-muted-foreground hover:text-foreground">
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
                <Link key={i} href="#" className="text-muted-foreground hover:text-foreground">
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

