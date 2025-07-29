"use client"

import React from "react"

import { useState } from "react"
import { Upload, Search, FileSpreadsheet, Users, BookOpen, TrendingUp, Download } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { MultiSelect } from "@/components/multi-select"

interface StudentGrade {
  name: string
  preliminar1: number | string
  cuatrimestre1: number | string
  preliminar2: number | string
  cuatrimestre2: number | string
  final: number | string
}

interface SubjectData {
  subject: string
  course: string
  year: string
  section: string
  students: StudentGrade[]
}

interface Statistics {
  totalSubjects: number
  passedSubjects: number
  failedSubjects: number
  averageGrade: number // This average is always based on 'final' grade
}

export default function StudentGradesApp() {
  const [files, setFiles] = useState<SubjectData[]>([])
  const [searchStudent, setSearchStudent] = useState("")
  const [searchSubject, setSearchSubject] = useState("")
  const [selectedCourse, setSelectedCourse] = useState<string>("all")
  const [selectedGradeTypes, setSelectedGradeTypes] = useState<string[]>(["final"])
  const [minFailedSubjects, setMinFailedSubjects] = useState<number | string>("")
  const [minFailedGradeType, setMinFailedGradeType] = useState<string>("final") // New state for grade type for min failed subjects
  const [loading, setLoading] = useState(false)
  const [error, setError] = React.useState<string>("") // Changed to React.useState

  const [expandedEvaluationType, setExpandedEvaluationType] = useState<string | null>(null)

  const gradeTypeOptions = [
    { value: "preliminar1", label: "1º Valoración Preliminar" },
    { value: "cuatrimestre1", label: "Calificación 1º Cuatrimestre" },
    { value: "preliminar2", label: "2º Valoración Preliminar" },
    { value: "cuatrimestre2", label: "Calificación 2º Cuatrimestre" },
    { value: "final", label: "Calificación Final" },
  ]

  // Helper function to normalize strings (remove accents, convert to lowercase)
  const normalizeString = (str: string): string => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  }

  // Helper function to determine if a subject should be excluded from display
  const isExcludedSubject = (subjectName: string): boolean => {
    const normalizedName = normalizeString(subjectName)
    return (
      normalizedName.includes("lenguajes tecnologicos") ||
      normalizedName.includes("sistemas tecnologicos") ||
      normalizedName.includes("procedimientos tecnicos")
      // TALLER - General is now explicitly NOT excluded here
    )
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles) return

    setLoading(true)
    setError("")

    try {
      const newFiles: SubjectData[] = []

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i]
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: "array" })

        workbook.SheetNames.forEach((sheetName) => {
          // IMPORTANT: If the sheet name is "TALLER - General", skip it.
          // The calculated "TALLER - General" will be added later.
          if (normalizeString(sheetName) === "taller - general") {
            return // Skip this sheet
          }

          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

          const courseInfo = jsonData[6] as string[]
          let year = "",
            section = ""

          if (courseInfo) {
            const yearCell = courseInfo.find((cell) => typeof cell === "string" && cell.includes("AÑO:"))
            const sectionCell = courseInfo.find((cell) => typeof cell === "string" && cell.includes("SECCIÓN:"))

            if (yearCell) year = yearCell.replace("AÑO:", "").trim()
            if (sectionCell) section = sectionCell.replace("SECCIÓN:", "").trim()
          }

          const course = `${year} ${section}`.trim()

          const students: StudentGrade[] = []

          for (let row = 10; row < jsonData.length; row++) {
            const rowData = jsonData[row] as any[]
            if (rowData && rowData[1] && typeof rowData[1] === "string" && rowData[1].trim()) {
              const studentName = rowData[1].toString().trim()

              const excludedTitles = [
                "TOTAL DE ESTUDIANTES",
                "APROBADAS/OS",
                "DESAPROBADAS/OS",
                "SIN EVALUAR",
                "TOTAL DE CLASES DE LA MATERIA",
                "CLASES EFECTIVAMENTE DADAS",
                "VALORACIÓN",
                "CALIFICACIÓN",
              ]

              const isValidStudentName =
                studentName.length > 2 &&
                !excludedTitles.some((title) => studentName.toUpperCase().includes(title.toUpperCase())) &&
                !studentName.toLowerCase().includes("valoración") &&
                !studentName.toLowerCase().includes("calificación")

              if (isValidStudentName) {
                const student: StudentGrade = {
                  name: studentName,
                  preliminar1: cleanGradeValue(rowData[8]),
                  cuatrimestre1: cleanGradeValue(rowData[9]),
                  preliminar2: cleanGradeValue(rowData[16]),
                  cuatrimestre2: cleanGradeValue(rowData[17]),
                  final: cleanGradeValue(rowData[22]),
                }

                students.push(student)
              }
            }
          }

          if (students.length > 0) {
            newFiles.push({
              subject: sheetName,
              course: course || file.name.replace(".xlsx", "").replace(".xls", ""),
              year,
              section,
              students,
            })
          }
        })
      }

      // Now, process workshop subjects from the filtered newFiles.
      // This function will add the *calculated* TALLER - General.
      const processedFiles = processWorkshopSubjects(newFiles)

      setFiles((prev) => [...prev, ...processedFiles])
    } catch (err) {
      setError("Error al procesar los archivos Excel. Verifique el formato.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Helper function to get subjects relevant to a student, applying global filters
  // `ignoreSubjectFilter` is used when calculating minFailedSubjects to ensure all subjects are considered.
  const getStudentSubjectsFiltered = (studentName: string, ignoreSubjectFilter = false) => {
    return files
      .filter((file) => {
        // Check if student is in this subject
        const studentInSubject = file.students.some(
          (student) => student.name.toLowerCase().trim() === studentName.toLowerCase().trim(),
        )
        if (!studentInSubject) return false

        // Apply course filter
        if (selectedCourse !== "all") {
          const groupedCourses = getGroupedCourses()
          const selectedGroup = groupedCourses.find((group) => group.normalizedName === selectedCourse)
          if (!selectedGroup || !Array.from(selectedGroup.originalNames).includes(file.course)) {
            return false
          }
        }

        // Apply subject filter, but only if not ignoring it (e.g., for minFailedSubjects calculation)
        if (searchSubject && !ignoreSubjectFilter) {
          if (!normalizeString(file.subject).includes(normalizeString(searchSubject))) {
            return false
          }
        }
        return true
      })
      .map((subject) => {
        // Attach student's specific data for convenience
        const student = subject.students.find((s) => s.name.toLowerCase().trim() === studentName.toLowerCase().trim())
        return {
          ...subject,
          studentData: student,
        }
      })
  }

  // Calculates overall statistics for a student based on a specific grade type for failed count.
  // The average grade is always based on 'final' grade.
  const getStudentOverallStatistics = (
    studentSubjectsWithData: {
      subject: string
      course: string
      year: string
      section: string
      studentData: StudentGrade | undefined
    }[],
    gradeTypeForFailedCount: keyof StudentGrade = "final",
  ): Statistics => {
    let totalSubjects = 0
    let passedSubjects = 0
    let failedSubjects = 0
    let totalFinalGrades = 0
    let finalGradeSum = 0

    studentSubjectsWithData.forEach((item) => {
      if (item.studentData) {
        // Calculate failed/passed subjects based on gradeTypeForFailedCount
        const gradeStr = item.studentData[gradeTypeForFailedCount].toString().trim().toUpperCase()
        const grade = Number.parseFloat(gradeStr)

        if (gradeTypeForFailedCount === "preliminar1" || gradeTypeForFailedCount === "preliminar2") {
          if (gradeStr === "TEA") {
            totalSubjects++
            passedSubjects++
          } else if (gradeStr === "TEP" || gradeStr === "TED") {
            totalSubjects++
            failedSubjects++
          } else if (!isNaN(grade) && grade > 0) {
            totalSubjects++
            if (grade >= 7) {
              passedSubjects++
            } else {
              failedSubjects++
            }
          }
        } else {
          if (!isNaN(grade) && grade > 0) {
            totalSubjects++
            if (grade >= 7) {
              passedSubjects++
            } else {
              failedSubjects++
            }
          }
        }

        // Always calculate average based on final grade
        const finalGrade = Number.parseFloat(item.studentData.final.toString())
        if (!isNaN(finalGrade) && finalGrade > 0) {
          totalFinalGrades++
          finalGradeSum += finalGrade
        }
      }
    })

    return {
      totalSubjects,
      passedSubjects,
      failedSubjects,
      averageGrade: totalFinalGrades > 0 ? finalGradeSum / totalFinalGrades : 0,
    }
  }

  const getFilteredData = () => {
    return files.filter((file) => {
      // 1. Filter by Course
      if (selectedCourse !== "all") {
        const groupedCourses = getGroupedCourses()
        const selectedGroup = groupedCourses.find((group) => group.normalizedName === selectedCourse)
        if (!selectedGroup || !Array.from(selectedGroup.originalNames).includes(file.course)) {
          return false
        }
      }

      // 2. Filter by Subject Name (only if minFailedSubjects is not active)
      const isMinFailedActive = minFailedSubjects !== "" && Number(minFailedSubjects) > 0
      const matchesSubject =
        isMinFailedActive || !searchSubject || normalizeString(file.subject).includes(normalizeString(searchSubject))
      if (!matchesSubject) {
        return false
      }

      // 3. Filter by Student Name (if any student in this subject matches, only if minFailedSubjects is not active)
      const matchesStudent =
        isMinFailedActive ||
        !searchStudent ||
        file.students.some((student) => normalizeString(student.name).includes(normalizeString(searchStudent)))
      if (!matchesStudent) {
        return false
      }

      // 4. Exclude specific subjects from display in "Calificaciones" tab
      // TALLER - General is now explicitly NOT excluded here
      if (isExcludedSubject(file.subject)) {
        return false
      }

      return true // All filters passed
    })
  }

  const getFilteredStudents = () => {
    let students = getUniqueStudents()

    const isMinFailedActive = minFailedSubjects !== "" && Number(minFailedSubjects) > 0

    // Apply searchStudent filter first, but only if minFailedSubjects is not active
    if (searchStudent && !isMinFailedActive) {
      students = students.filter((studentName) => normalizeString(studentName).includes(normalizeString(searchStudent)))
    }

    // Filter students based on whether they have any subjects matching the course/subject filters
    // If minFailedSubjects is active, ignore searchSubject for this check
    students = students.filter((studentName) => {
      const studentSubjects = getStudentSubjectsFiltered(studentName, isMinFailedActive)
      return studentSubjects.length > 0
    })

    // Finally, apply the minFailedSubjects filter
    if (isMinFailedActive) {
      const min = Number(minFailedSubjects)
      students = students.filter((studentName) => {
        // Pass true to ignore subject filter for this specific calculation
        // This ensures ALL subjects for the student (within the course filter) are considered for failed count
        const studentSubjects = getStudentSubjectsFiltered(studentName, true)
        // Pass the selected minFailedGradeType to getStudentOverallStatistics
        const stats = getStudentOverallStatistics(studentSubjects, minFailedGradeType as keyof StudentGrade)
        return stats.failedSubjects >= min
      })
    }

    return students
  }

  const getFilteredCourses = () => {
    const groupedCourses = getGroupedCourses()
    const isMinFailedActive = minFailedSubjects !== "" && Number(minFailedSubjects) > 0

    if (searchStudent || searchSubject || isMinFailedActive) {
      return groupedCourses
        .filter((group) => {
          return group.subjects.some((file) => {
            // If minFailedActive, student and subject filters are ignored for the initial data filtering
            const matchesStudent =
              isMinFailedActive ||
              !searchStudent ||
              file.students.some((student) => normalizeString(student.name).includes(normalizeString(searchStudent)))
            const matchesSubject =
              isMinFailedActive ||
              !searchSubject ||
              normalizeString(file.subject).includes(normalizeString(searchSubject))

            if (isMinFailedActive) {
              // If minFailed is active, we only care if the course has any students that *could* be filtered later
              // and if the subject matches the course filter.
              // The student/subject search inputs are ignored for the initial data set.
              return true // All subjects in the course are potentially relevant
            } else if (searchStudent && searchSubject) {
              return matchesStudent && matchesSubject
            }
            return matchesStudent || matchesSubject
          })
        })
        .map((group) => group.normalizedName)
    }

    return groupedCourses.map((group) => group.normalizedName)
  }

  const getUniqueStudents = () => {
    const students = new Set<string>()
    files.forEach((file) => {
      file.students.forEach((student) => {
        if (student.name.trim()) {
          students.add(student.name)
        }
      })
    })
    return Array.from(students).sort()
  }

  const getUniqueCourses = () => {
    return getGroupedCourses().map((group) => group.normalizedName)
  }

  const getGradeValue = (student: StudentGrade, type: string) => {
    switch (type) {
      case "preliminar1":
        return student.preliminar1
      case "cuatrimestre1":
        return student.cuatrimestre1
      case "preliminar2":
        return student.preliminar2
      case "cuatrimestre2":
        return student.cuatrimestre2
      case "final":
        return student.final
      default:
        return student.final
    }
  }

  const getGradeTypeLabel = (type: string) => {
    return gradeTypeOptions.find((option) => option.value === type)?.label || type
  }

  const cleanGradeValue = (value: any): string | number => {
    if (!value) return ""

    const strValue = value.toString().trim()

    if (strValue.length > 10 && strValue.toLowerCase().includes("valoración")) {
      return ""
    }

    const numValue = Number.parseFloat(strValue)
    if (!isNaN(numValue)) {
      return numValue
    }

    if (strValue.length <= 5) {
      return strValue.toUpperCase()
    }

    return ""
  }

  const normalizeCourse = (course: string): string => {
    if (!course || !course.trim()) return "Sin curso"

    const cleanCourse = course.trim().toUpperCase()

    const match = cleanCourse.match(/(\d+).*?(\d+)/)

    if (match) {
      const year = match[1]
      const section = match[2]
      return `${year}° ${section}`
    }

    return cleanCourse
  }

  const getGroupedCourses = () => {
    const courseGroups = new Map<
      string,
      {
        normalizedName: string
        originalNames: Set<string>
        subjects: SubjectData[]
      }
    >()

    files.forEach((file) => {
      const normalized = normalizeCourse(file.course)

      if (!courseGroups.has(normalized)) {
        courseGroups.set(normalized, {
          normalizedName: normalized,
          originalNames: new Set(),
          subjects: [],
        })
      }

      const group = courseGroups.get(normalized)!
      group.originalNames.add(file.course)
      group.subjects.push(file)
    })

    return Array.from(courseGroups.values()).sort((a, b) => {
      const aMatch = a.normalizedName.match(/(\d+)° (\d+)/)
      const bMatch = b.normalizedName.match(/(\d+)° (\d+)/)

      if (aMatch && bMatch) {
        const aYear = Number.parseInt(aMatch[1])
        const bYear = Number.parseInt(bMatch[1])
        if (aYear !== bYear) return aYear - bYear

        const aSection = Number.parseInt(bMatch[2])
        const bSection = Number.parseInt(aMatch[2])
        return aSection - bSection
      }

      return a.normalizedName.localeCompare(b.normalizedName)
    })
  }

  const processWorkshopSubjects = (files: SubjectData[]): SubjectData[] => {
    const processedFiles = [...files]

    const courseGroups = new Map<string, SubjectData[]>()

    processedFiles.forEach((file) => {
      const course = file.course
      if (!courseGroups.has(course)) {
        courseGroups.set(course, [])
      }
      courseGroups.get(course)!.push(file)
    })

    courseGroups.forEach((subjects, course) => {
      const workshopSubjects = subjects.filter((subject) => {
        const normalizedSubjectName = normalizeString(subject.subject)
        return (
          normalizedSubjectName.includes("lenguajes tecnologicos") ||
          normalizedSubjectName.includes("sistemas tecnologicos") ||
          normalizedSubjectName.includes("procedimientos tecnicos")
        )
      })

      if (workshopSubjects.length === 0) return

      const allStudents = new Set<string>()
      workshopSubjects.forEach((subject) => {
        subject.students.forEach((student) => {
          allStudents.add(student.name)
        })
      })

      const tallerStudents: StudentGrade[] = []

      allStudents.forEach((studentName) => {
        const studentWorkshopGrades = workshopSubjects
          .map((subject) => {
            return subject.students.find((s) => s.name === studentName)
          })
          .filter(Boolean)

        if (studentWorkshopGrades.length === 0) return

        const cuatrimestre1Grades = studentWorkshopGrades
          .map((student) => {
            const grade = Number.parseFloat(student!.cuatrimestre1.toString())
            return isNaN(grade) ? null : grade
          })
          .filter((grade) => grade !== null && grade > 0) as number[]

        const cuatrimestre2Grades = studentWorkshopGrades
          .map((student) => {
            const grade = Number.parseFloat(student!.cuatrimestre2.toString())
            return isNaN(grade) ? null : grade
          })
          .filter((grade) => grade !== null && grade > 0) as number[]

        const customRound = (num: number): number => {
          const decimal = num - Math.floor(num)
          if (decimal >= 0.5) {
            return Math.ceil(num)
          } else {
            return Math.floor(num)
          }
        }

        let cuatrimestre1Average = ""
        let cuatrimestre2Average = ""

        if (cuatrimestre1Grades.length > 0) {
          const avg = cuatrimestre1Grades.reduce((sum, grade) => sum + grade, 0) / cuatrimestre1Grades.length
          cuatrimestre1Average = customRound(avg).toString()
        }

        if (cuatrimestre2Grades.length > 0) {
          const avg = cuatrimestre2Grades.reduce((sum, grade) => sum + grade, 0) / cuatrimestre2Grades.length
          cuatrimestre2Average = customRound(avg).toString()
        }

        let finalGrade = ""
        if (cuatrimestre1Average && cuatrimestre2Average) {
          const avg = (Number.parseFloat(cuatrimestre1Average) + Number.parseFloat(cuatrimestre2Average)) / 2
          finalGrade = customRound(avg).toString()
        } else if (cuatrimestre1Average && !cuatrimestre2Average) {
          finalGrade = cuatrimestre1Average
        } else if (!cuatrimestre1Average && cuatrimestre2Average) {
          finalGrade = cuatrimestre2Average
        }

        tallerStudents.push({
          name: studentName,
          preliminar1: "",
          cuatrimestre1: cuatrimestre1Average,
          preliminar2: "",
          cuatrimestre2: cuatrimestre2Average,
          final: finalGrade,
        })
      })

      if (tallerStudents.length > 0) {
        processedFiles.push({
          subject: "TALLER - General",
          course: subjects[0]?.course || course,
          year: subjects[0]?.year || "",
          section: subjects[0]?.section || "",
          students: tallerStudents,
        })
      }
    })

    return processedFiles
  }

  const exportToExcel = (data: any[], filename: string) => {
    try {
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Datos")

      XLSX.writeFile(wb, `${filename}.xlsx`)
    } catch (error) {
      console.error("Error al exportar:", error)
      alert("Error al exportar el archivo. Por favor, intente nuevamente.")
    }
  }

  const exportStudentData = (studentName: string) => {
    // When exporting individual student data, we should respect the current searchSubject filter
    const studentSubjects = getStudentSubjectsFiltered(studentName, false)
    const exportData = studentSubjects
      .filter((item) => !isExcludedSubject(item.subject)) // Exclude original subjects from export
      .map((item) => ({
        Estudiante: studentName,
        Materia: item.subject,
        Curso: item.course,
        "1º Val. Preliminar": item.studentData?.preliminar1 || "",
        "1º Cuatrimestre": item.studentData?.cuatrimestre1 || "",
        "2º Val. Preliminar": item.studentData?.preliminar2 || "",
        "2º Cuatrimestre": item.studentData?.cuatrimestre2 || "",
        "Calificación Final": item.studentData?.final || "",
      }))

    exportToExcel(exportData, `Calificaciones_${studentName.replace(/\s+/g, "_")}`)
  }

  const exportAllGrades = () => {
    const filteredFiles = getFilteredData() // getFilteredData already excludes subjects
    const allData: any[] = []

    filteredFiles.forEach((subject) => {
      subject.students.forEach((student) => {
        // This check is redundant if getFilteredData already handles searchStudent, but kept for safety
        const isMinFailedActive = minFailedSubjects !== "" && Number(minFailedSubjects) > 0
        if (
          isMinFailedActive ||
          !searchStudent ||
          normalizeString(student.name).includes(normalizeString(searchStudent))
        ) {
          allData.push({
            Estudiante: student.name,
            Materia: subject.subject,
            Curso: subject.course,
            "1º Val. Preliminar": student.preliminar1 || "",
            "1º Cuatrimestre": student.cuatrimestre1 || "",
            "2º Val. Preliminar": student.preliminar2 || "",
            "2º Cuatrimestre": student.cuatrimestre2 || "",
            "Calificación Final": student.final || "",
          })
        }
      })
    })

    exportToExcel(allData, "Todas_las_Calificaciones_Filtradas")
  }

  const exportStatistics = () => {
    const filteredStudentsForExport = getFilteredStudents() // This already applies all filters including minFailedSubjects
    const statsData: any[] = []

    filteredStudentsForExport.forEach((studentName) => {
      // For statistics export, we need to calculate stats for ALL grade types,
      // so we pass false to ignoreSubjectFilter and iterate through all grade types.
      const studentSubjectsForAllGrades = getStudentSubjectsFiltered(studentName, false)

      const calculateStatsForGradeType = (gradeType: keyof StudentGrade) => {
        let totalSubjects = 0
        let passedSubjects = 0
        let failedSubjects = 0
        let totalGrades = 0
        let gradeSum = 0

        studentSubjectsForAllGrades.forEach((item) => {
          // Do NOT exclude subjects here, as we need all data for overall stats
          if (item.studentData) {
            const gradeStr = item.studentData[gradeType].toString().trim().toUpperCase()
            const grade = Number.parseFloat(gradeStr)

            if (gradeType === "preliminar1" || gradeType === "preliminar2") {
              if (gradeStr === "TEA") {
                totalSubjects++
                passedSubjects++
              } else if (gradeStr === "TEP" || gradeStr === "TED") {
                totalSubjects++
                failedSubjects++
              } else if (!isNaN(grade) && grade > 0) {
                totalSubjects++
                totalGrades++
                gradeSum += grade
                if (grade >= 7) {
                  passedSubjects++
                } else {
                  failedSubjects++
                }
              }
            } else {
              if (!isNaN(grade) && grade > 0) {
                totalSubjects++
                totalGrades++
                gradeSum += grade
                if (grade >= 7) {
                  passedSubjects++
                } else {
                  failedSubjects++
                }
              }
            }
          }
        })

        return {
          totalSubjects,
          passedSubjects,
          failedSubjects,
          averageGrade: totalGrades > 0 ? gradeSum / totalGrades : 0,
        }
      }

      const preliminar1Stats = calculateStatsForGradeType("preliminar1")
      const cuatrimestre1Stats = calculateStatsForGradeType("cuatrimestre1")
      const preliminar2Stats = calculateStatsForGradeType("preliminar2")
      const cuatrimestre2Stats = calculateStatsForGradeType("cuatrimestre2")
      const finalStats = calculateStatsForGradeType("final")

      statsData.push({
        Estudiante: studentName,
        "1º Prelim - Total": preliminar1Stats.totalSubjects,
        "1º Prelim - Aprobó": preliminar1Stats.passedSubjects,
        "1º Prelim - Desaprobó": preliminar1Stats.failedSubjects,
        "1º Cuatr - Total": cuatrimestre1Stats.totalSubjects,
        "1º Cuatr - Aprobó": cuatrimestre1Stats.passedSubjects,
        "1º Cuatr - Desaprobó": cuatrimestre1Stats.failedSubjects,
        "2º Prelim - Total": preliminar2Stats.totalSubjects,
        "2º Prelim - Aprobó": preliminar2Stats.passedSubjects,
        "2º Prelim - Desaprobó": preliminar2Stats.failedSubjects,
        "2º Cuatr - Total": cuatrimestre2Stats.totalSubjects,
        "2º Cuatr - Aprobó": cuatrimestre2Stats.passedSubjects,
        "2º Cuatr - Desaprobó": cuatrimestre2Stats.failedSubjects,
        "Final - Total": finalStats.totalSubjects,
        "Final - Aprobó": finalStats.passedSubjects,
        "Final - Desaprobó": finalStats.failedSubjects,
      })
    })

    exportToExcel(statsData, "Estadisticas_Estudiantes_Filtradas")
  }

  const exportStudentsWithFailedSubjects = () => {
    if (minFailedSubjects === "" || isNaN(Number(minFailedSubjects))) {
      alert("Por favor, ingrese un número válido para el mínimo de materias desaprobadas.")
      return
    }
    const min = Number(minFailedSubjects)
    const studentsToExport = filteredStudents.filter((studentName) => {
      // For this export, we need to calculate stats based on the selected minFailedGradeType
      // and ignore the searchSubject filter.
      const studentSubjects = getStudentSubjectsFiltered(studentName, true)
      const stats = getStudentOverallStatistics(studentSubjects, minFailedGradeType as keyof StudentGrade)
      return stats.failedSubjects >= min
    })

    const exportData = studentsToExport.map((studentName) => {
      const studentSubjects = getStudentSubjectsFiltered(studentName, true) // Ensure all subjects are considered
      const stats = getStudentOverallStatistics(studentSubjects, minFailedGradeType as keyof StudentGrade)
      return {
        Estudiante: studentName,
        [`Materias Desaprobadas (${getGradeTypeLabel(minFailedGradeType)})`]: stats.failedSubjects,
        [`Total Materias Evaluadas (${getGradeTypeLabel(minFailedGradeType)})`]: stats.totalSubjects,
        "Promedio Final (General)": stats.averageGrade.toFixed(1), // Average is always final
        Cursos: Array.from(new Set(studentSubjects.map((s) => s.course))).join(", "),
      }
    })

    exportToExcel(
      exportData,
      `Alumnos_con_${min}_o_mas_desaprobadas_en_${getGradeTypeLabel(minFailedGradeType).replace(/\s+/g, "_")}`,
    )
  }

  const exportSubjectDetails = (evaluationType: string) => {
    const subjectStats = new Map<
      string,
      {
        subject: string
        course: string
        total: number
        passed: number
        failed: number
        teaCount: number
        approvalRate: number
      }
    >()

    // Use filteredData which already excludes the specified subjects
    filteredData.forEach((subject) => {
      let subjectTotal = 0
      let subjectPassed = 0
      let subjectFailed = 0
      let teaCount = 0

      subject.students.forEach((student) => {
        // Only consider students that pass the current filters
        const studentPassesFilters = filteredStudents.includes(student.name)
        if (!studentPassesFilters) return

        const gradeStr = student[evaluationType as keyof StudentGrade].toString().trim().toUpperCase()
        const grade = Number.parseFloat(gradeStr)

        if (evaluationType === "preliminar1" || evaluationType === "preliminar2") {
          if (gradeStr === "TEA") {
            subjectTotal++
            subjectPassed++
            teaCount++
          } else if (gradeStr === "TEP" || gradeStr === "TED") {
            subjectTotal++
            subjectFailed++
          } else if (!isNaN(grade) && grade > 0) {
            subjectTotal++
            if (grade >= 7) {
              subjectPassed++
            } else {
              subjectFailed++
            }
          }
        } else {
          if (!isNaN(grade) && grade > 0) {
            subjectTotal++
            if (grade >= 7) {
              subjectPassed++
            } else {
              subjectFailed++
            }
          }
        }
      })

      if (subjectTotal > 0) {
        subjectStats.set(subject.subject, {
          subject: subject.subject,
          course: subject.course,
          total: subjectTotal,
          passed: subjectPassed,
          failed: subjectFailed,
          teaCount: teaCount,
          approvalRate: (subjectPassed / subjectTotal) * 100,
        })
      }
    })

    const exportData = Array.from(subjectStats.values()).map((stat) => ({
      Materia: stat.subject,
      Curso: stat.course,
      Total: stat.total,
      Aprobados: stat.passed,
      Desaprobados: stat.failed,
      TEA: stat.teaCount,
      "Tasa de Aprobación": stat.approvalRate.toFixed(1) + "%",
    }))

    exportToExcel(exportData, `Detalle_Materias_${evaluationType}`)
  }

  const exportSubjectMatrix = (evaluationType: string) => {
    // Get all unique students from filtered data
    const allStudents = new Set<string>()
    filteredData.forEach((subject) => {
      subject.students.forEach((student) => {
        if (filteredStudents.includes(student.name)) {
          allStudents.add(student.name)
        }
      })
    })

    // Get all unique subjects from filtered data
    const allSubjects = filteredData.map((subject) => subject.subject)

    // Create matrix data
    const matrixData: any[] = []

    Array.from(allStudents)
      .sort()
      .forEach((studentName) => {
        const studentRow: any = {
          Estudiante: studentName,
        }

        // For each subject, find the student's grade
        allSubjects.forEach((subjectName) => {
          const subjectData = filteredData.find((s) => s.subject === subjectName)
          const studentData = subjectData?.students.find((s) => s.name === studentName)

          if (studentData) {
            const gradeStr = studentData[evaluationType as keyof StudentGrade].toString().trim().toUpperCase()
            const grade = Number.parseFloat(gradeStr)

            // Determine status for coloring
            let status = "N/A"
            if (evaluationType === "preliminar1" || evaluationType === "preliminar2") {
              if (gradeStr === "TEA" || (!isNaN(grade) && grade >= 7)) {
                status = "APROBADO"
              } else if (gradeStr === "TEP" || gradeStr === "TED" || (!isNaN(grade) && grade < 7 && grade > 0)) {
                status = "DESAPROBADO"
              }
            } else {
              if (!isNaN(grade) && grade > 0) {
                if (grade >= 7) {
                  status = "APROBADO"
                } else {
                  status = "DESAPROBADO"
                }
              }
            }

            studentRow[subjectName] = `${gradeStr || "N/A"} (${status})`
          } else {
            studentRow[subjectName] = "N/A (N/A)"
          }
        })

        matrixData.push(studentRow)
      })

    // Create workbook with conditional formatting
    const ws = XLSX.utils.json_to_sheet(matrixData)
    const wb = XLSX.utils.book_new()

    // Apply conditional formatting (note: this is basic, Excel will need manual formatting for colors)
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1")

    // Add a note about formatting in the first row
    const headerRow: any = { Estudiante: "NOTA: Verde = Aprobado (TEA o ≥7), Amarillo = Desaprobado (TEP/TED o <7)" }
    allSubjects.forEach((subject) => {
      headerRow[subject] = "Formato: Nota (Estado)"
    })

    // Insert header row
    XLSX.utils.sheet_add_json(ws, [headerRow], { origin: "A1" })
    XLSX.utils.sheet_add_json(ws, matrixData, { origin: "A2", skipHeader: true })

    XLSX.utils.book_append_sheet(wb, ws, "Matriz_Calificaciones")

    XLSX.writeFile(
      wb,
      `Matriz_Calificaciones_${evaluationType}_${getGradeTypeLabel(evaluationType).replace(/\s+/g, "_")}.xlsx`,
    )
  }

  const isMinFailedFilterActive = minFailedSubjects !== "" && Number(minFailedSubjects) > 0

  const filteredData = getFilteredData()
  const filteredStudents = getFilteredStudents()
  const filteredCourses = getFilteredCourses()

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-yellow-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b-4 border-green-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-5JPqrblKVsZwPz95uwdT9AMKcEN27V.png"
                alt="Logo E.E.S.T. Nº 6"
                className="h-16 w-16"
              />
              <div>
                <h1 className="text-2xl font-bold text-green-800">E.E.S.T. Nº 6 Banfield</h1>
                <p className="text-green-600">Sistema de Gestión de Calificaciones</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="bg-green-100 text-green-800">
                {files.length} materias cargadas
              </Badge>
              {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800">
                  {filteredData.length} materias filtradas
                </Badge>
              )}
              {files.length > 0 && (
                <div className="flex space-x-2">
                  <Button
                    onClick={exportAllGrades}
                    variant="outline"
                    size="sm"
                    className="border-green-300 text-green-700 hover:bg-green-50 bg-transparent"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar {searchStudent || searchSubject || selectedCourse !== "all" ? "Filtrado" : "Todo"}
                  </Button>
                  <Button
                    onClick={exportStatistics}
                    variant="outline"
                    size="sm"
                    className="border-green-300 text-green-700 hover:bg-green-50 bg-transparent"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Estadísticas
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <Card className="mb-8 border-green-200">
          <CardHeader className="bg-green-50">
            <CardTitle className="flex items-center space-x-2 text-green-800">
              <Upload className="h-5 w-5" />
              <span>Cargar Archivos Excel</span>
            </CardTitle>
            <CardDescription>Seleccione los archivos Excel con las planillas de calificaciones</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-green-300 border-dashed rounded-lg cursor-pointer bg-green-50 hover:bg-green-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileSpreadsheet className="w-8 h-8 mb-4 text-green-500" />
                  <p className="mb-2 text-sm text-green-700">
                    <span className="font-semibold">Click para cargar</span> o arrastra archivos aquí
                  </p>
                  <p className="text-xs text-green-500">Excel (.xlsx, .xls)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
              </label>
            </div>
            {loading && <div className="mt-4 text-center text-green-600">Procesando archivos...</div>}
            {error && (
              <Alert className="mt-4 border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {files.length > 0 && (
          <>
            {/* Filters */}
            <Card className="mb-8 border-green-200">
              <CardHeader className="bg-green-50">
                <CardTitle className="flex items-center space-x-2 text-green-800">
                  <Search className="h-5 w-5" />
                  <span>Filtros de Búsqueda</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">Buscar estudiante</label>
                    <Input
                      placeholder="Nombre del estudiante..."
                      value={searchStudent}
                      onChange={(e) => setSearchStudent(e.target.value)}
                      className="border-green-300 focus:border-green-500"
                      disabled={isMinFailedFilterActive}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">Buscar materia</label>
                    <Input
                      placeholder="Nombre de la materia..."
                      value={searchSubject}
                      onChange={(e) => setSearchSubject(e.target.value)}
                      className="border-green-300 focus:border-green-500"
                      disabled={isMinFailedFilterActive}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">Curso</label>
                    <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                      <SelectTrigger className="border-green-300 focus:border-green-500">
                        <SelectValue placeholder="Seleccionar curso" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los cursos</SelectItem>
                        {getUniqueCourses().map((course) => (
                          <SelectItem key={course} value={course}>
                            {course}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">Tipo de calificación</label>
                    <MultiSelect
                      options={gradeTypeOptions}
                      selected={selectedGradeTypes}
                      onValueChange={setSelectedGradeTypes}
                      placeholder="Seleccionar tipos de calificación"
                      className="border-green-300 focus:border-green-500"
                    />
                  </div>
                  <div className="col-span-full md:col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-green-700 mb-2">
                        Mín. materias desaprobadas
                      </label>
                      <Input
                        type="number"
                        placeholder="Ej: 3"
                        value={minFailedSubjects}
                        onChange={(e) => setMinFailedSubjects(e.target.value)}
                        className="border-green-300 focus:border-green-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {"Muestra alumnos con este número o más materias desaprobadas."}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-green-700 mb-2">Tipo de valoración</label>
                      <Select value={minFailedGradeType} onValueChange={setMinFailedGradeType}>
                        <SelectTrigger className="border-green-300 focus:border-green-500">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {gradeTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        {"Tipo de calificación para el conteo de desaprobadas."}
                      </p>
                    </div>
                  </div>
                </div>
                {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700">
                      <strong>Filtros activos:</strong>
                      {searchStudent && ` Estudiante: "${searchStudent}"`}
                      {searchSubject && ` Materia: "${searchSubject}"`}
                      {selectedCourse !== "all" && ` | Curso: ${selectedCourse}`}
                      {selectedGradeTypes.length > 1
                        ? ` | Tipos de Calificación: Múltiples`
                        : selectedGradeTypes.length === 1
                          ? ` | Tipo de Calificación: ${getGradeTypeLabel(selectedGradeTypes[0])}`
                          : ""}
                      {minFailedSubjects !== "" &&
                        ` | Mín. desaprobadas: ${minFailedSubjects} (${getGradeTypeLabel(minFailedGradeType)})`}
                      {` | Mostrando: ${filteredStudents.length} estudiantes, ${filteredData.length} materias`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Main Content */}
            <Tabs defaultValue="grades" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 bg-green-100">
                <TabsTrigger value="grades" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Calificaciones ({filteredData.length})
                </TabsTrigger>
                <TabsTrigger
                  value="students"
                  className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Estudiantes ({filteredStudents.length})
                </TabsTrigger>
                <TabsTrigger
                  value="statistics"
                  className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Estadísticas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="grades">
                <div className="space-y-6">
                  {filteredData.length === 0 ? (
                    <Card className="border-yellow-200">
                      <CardContent className="text-center py-8">
                        <p className="text-gray-500">
                          No se encontraron materias que coincidan con los filtros aplicados.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredData.map((subject, index) => (
                      <Card key={index} className="border-green-200">
                        <CardHeader className="bg-green-50">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-green-800">{subject.subject}</CardTitle>
                              <CardDescription>
                                Curso: {subject.course} |{" "}
                                {selectedGradeTypes.length > 1
                                  ? "Múltiples Calificaciones"
                                  : selectedGradeTypes.length === 1
                                    ? getGradeTypeLabel(selectedGradeTypes[0])
                                    : "Sin Calificación Seleccionada"}
                              </CardDescription>
                            </div>
                            <Badge className="bg-green-600">
                              {
                                subject.students.filter(
                                  (student) =>
                                    !searchStudent ||
                                    normalizeString(student.name).includes(normalizeString(searchStudent)),
                                ).length
                              }{" "}
                              estudiantes
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Estudiante</TableHead>
                                {selectedGradeTypes.map((type) => (
                                  <React.Fragment key={type}>
                                    <TableHead className="text-center">{getGradeTypeLabel(type)}</TableHead>
                                    <TableHead className="text-center">Estado</TableHead>
                                  </React.Fragment>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subject.students
                                .filter(
                                  (student) =>
                                    !searchStudent ||
                                    normalizeString(student.name).includes(normalizeString(searchStudent)),
                                )
                                .map((student, studentIndex) => (
                                  <TableRow key={studentIndex}>
                                    <TableCell className="font-medium">{student.name}</TableCell>
                                    {selectedGradeTypes.map((type) => {
                                      const grade = getGradeValue(student, type)
                                      const gradeStr = grade.toString().trim()
                                      const numericGrade = Number.parseFloat(gradeStr)
                                      const isTea = gradeStr.toUpperCase() === "TEA"
                                      const isPassed =
                                        (!isNaN(numericGrade) && numericGrade >= 7) ||
                                        (isTea && (type === "preliminar1" || type === "preliminar2"))
                                      const isFailed =
                                        gradeStr.toUpperCase() === "TEP" ||
                                        gradeStr.toUpperCase() === "TED" ||
                                        (!isNaN(numericGrade) && numericGrade < 7 && numericGrade > 0)

                                      return (
                                        <React.Fragment key={type}>
                                          <TableCell className="text-center">
                                            <Badge
                                              variant={isPassed ? "default" : isFailed ? "destructive" : "secondary"}
                                              className={isPassed ? "bg-green-600" : ""}
                                            >
                                              {grade || "N/A"}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-center">
                                            <Badge
                                              variant={isPassed ? "default" : isFailed ? "destructive" : "secondary"}
                                              className={isPassed ? "bg-green-100 text-green-800" : ""}
                                            >
                                              {isPassed ? "Aprobado" : isFailed ? "Desaprobado" : "N/A"}
                                            </Badge>
                                          </TableCell>
                                        </React.Fragment>
                                      )
                                    })}
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="students">
                <div className="grid gap-6">
                  {filteredStudents.length === 0 ? (
                    <Card className="border-yellow-200">
                      <CardContent className="text-center py-8">
                        <p className="text-gray-500">
                          No se encontraron estudiantes que coincidan con los filtros aplicados.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredStudents.map((studentName, index) => {
                      // For individual student cards, we want to show stats based on the current searchSubject filter
                      const studentSubjects = getStudentSubjectsFiltered(studentName, false)

                      const calculateStatsForGradeType = (gradeType: keyof StudentGrade) => {
                        let totalSubjects = 0
                        let passedSubjects = 0
                        let failedSubjects = 0
                        let totalGrades = 0
                        let gradeSum = 0

                        studentSubjects.forEach((item) => {
                          // Do NOT exclude subjects here, as we need all data for overall stats
                          if (item.studentData) {
                            const gradeStr = item.studentData[gradeType].toString().trim().toUpperCase()
                            const grade = Number.parseFloat(gradeStr)

                            if (gradeType === "preliminar1" || gradeType === "preliminar2") {
                              if (gradeStr === "TEA") {
                                totalSubjects++
                                passedSubjects++
                              } else if (gradeStr === "TEP" || gradeStr === "TED") {
                                totalSubjects++
                                failedSubjects++
                              } else if (!isNaN(grade) && grade > 0) {
                                totalSubjects++
                                totalGrades++
                                gradeSum += grade
                                if (grade >= 7) {
                                  passedSubjects++
                                } else {
                                  failedSubjects++
                                }
                              }
                            } else {
                              if (!isNaN(grade) && grade > 0) {
                                totalSubjects++
                                totalGrades++
                                gradeSum += grade
                                if (grade >= 7) {
                                  passedSubjects++
                                } else {
                                  failedSubjects++
                                }
                              }
                            }
                          }
                        })

                        return {
                          totalSubjects,
                          passedSubjects,
                          failedSubjects,
                          averageGrade: totalGrades > 0 ? gradeSum / totalGrades : 0,
                        }
                      }

                      const preliminar1Stats = calculateStatsForGradeType("preliminar1")
                      const cuatrimestre1Stats = calculateStatsForGradeType("cuatrimestre1")
                      const preliminar2Stats = calculateStatsForGradeType("preliminar2")
                      const cuatrimestre2Stats = calculateStatsForGradeType("cuatrimestre2")
                      const finalStats = calculateStatsForGradeType("final")

                      return (
                        <Card key={index} className="border-green-200">
                          <CardHeader className="bg-green-50">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-green-800">{studentName}</CardTitle>
                                <CardDescription>
                                  Resumen académico del estudiante
                                  {selectedCourse !== "all" && ` - Curso: ${selectedCourse}`}
                                </CardDescription>
                              </div>
                              <Button
                                onClick={() => exportStudentData(studentName)}
                                variant="outline"
                                size="sm"
                                className="border-green-300 text-green-700 hover:bg-green-50"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Exportar
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {/* Tabla detallada de materias */}
                            <div className="mb-6">
                              <h4 className="text-lg font-semibold text-green-800 mb-3">
                                Calificaciones (
                                {studentSubjects.filter((item) => !isExcludedSubject(item.subject)).length} materias)
                              </h4>
                              {studentSubjects.filter((item) => !isExcludedSubject(item.subject)).length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Materia</TableHead>
                                      <TableHead>Curso</TableHead>
                                      <TableHead className="text-center">1º Val. Prelim.</TableHead>
                                      <TableHead className="text-center">1º Cuatrimestre</TableHead>
                                      <TableHead className="text-center">2º Val. Prelim.</TableHead>
                                      <TableHead className="text-center">2º Cuatrimestre</TableHead>
                                      <TableHead className="text-center">Calif. Final</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {studentSubjects
                                      .filter((item) => !isExcludedSubject(item.subject)) // Filter for display
                                      .map((item, subjectIndex) => {
                                        const student = item.studentData!
                                        return (
                                          <TableRow key={subjectIndex}>
                                            <TableCell className="font-medium">{item.subject}</TableCell>
                                            <TableCell>{item.course}</TableCell>
                                            <TableCell className="text-center">
                                              {(() => {
                                                const gradeStr = student.preliminar1.toString().trim().toUpperCase()
                                                const grade = Number.parseFloat(gradeStr)
                                                const isPassed = gradeStr === "TEA" || (!isNaN(grade) && grade >= 7)
                                                const isFailed =
                                                  gradeStr === "TEP" ||
                                                  gradeStr === "TED" ||
                                                  (!isNaN(grade) && grade < 7 && grade > 0)

                                                return (
                                                  <Badge
                                                    variant={
                                                      isPassed ? "default" : isFailed ? "destructive" : "secondary"
                                                    }
                                                    className={isPassed ? "bg-green-600" : ""}
                                                  >
                                                    {student.preliminar1 || "N/A"}
                                                  </Badge>
                                                )
                                              })()}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {(() => {
                                                const grade = Number.parseFloat(student.cuatrimestre1.toString())
                                                const isPassed = !isNaN(grade) && grade >= 7
                                                return (
                                                  <Badge
                                                    variant={isPassed ? "default" : "destructive"}
                                                    className={isPassed ? "bg-green-600" : ""}
                                                  >
                                                    {student.cuatrimestre1 || "N/A"}
                                                  </Badge>
                                                )
                                              })()}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {(() => {
                                                const gradeStr = student.preliminar2.toString().trim().toUpperCase()
                                                const grade = Number.parseFloat(gradeStr)
                                                const isPassed = gradeStr === "TEA" || (!isNaN(grade) && grade >= 7)
                                                const isFailed =
                                                  gradeStr === "TEP" ||
                                                  gradeStr === "TED" ||
                                                  (!isNaN(grade) && grade < 7 && grade > 0)

                                                return (
                                                  <Badge
                                                    variant={
                                                      isPassed ? "default" : isFailed ? "destructive" : "secondary"
                                                    }
                                                    className={isPassed ? "bg-green-600" : ""}
                                                  >
                                                    {student.preliminar2 || "N/A"}
                                                  </Badge>
                                                )
                                              })()}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {(() => {
                                                const grade = Number.parseFloat(student.cuatrimestre2.toString())
                                                const isPassed = !isNaN(grade) && grade >= 7
                                                return (
                                                  <Badge
                                                    variant={isPassed ? "default" : "destructive"}
                                                    className={isPassed ? "bg-green-600" : ""}
                                                  >
                                                    {student.cuatrimestre2 || "N/A"}
                                                  </Badge>
                                                )
                                              })()}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {(() => {
                                                const grade = Number.parseFloat(student.final.toString())
                                                const isPassed = !isNaN(grade) && grade >= 7
                                                return (
                                                  <Badge
                                                    variant={isPassed ? "default" : "destructive"}
                                                    className={isPassed ? "bg-green-600" : ""}
                                                  >
                                                    {student.final || "N/A"}
                                                  </Badge>
                                                )
                                              })()}
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
                                  </TableBody>
                                </Table>
                              ) : (
                                <div className="text-center py-8 text-gray-500">
                                  <p>No se encontraron materias para este estudiante con los filtros aplicados</p>
                                </div>
                              )}
                            </div>

                            {/* Resumen estadístico por tipo de calificación */}
                            <div className="space-y-6">
                              <h4 className="text-lg font-semibold text-green-800">Resumen por Tipo de Calificación</h4>

                              {/* 1º Valoración Preliminar */}
                              <Card className="border-blue-200">
                                <CardHeader className="bg-blue-50 pb-3">
                                  <CardTitle className="text-blue-800 text-lg">1º Valoración Preliminar</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-3">
                                  <div className="grid grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-blue-600">
                                        {preliminar1Stats.totalSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Total</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-green-600">
                                        {preliminar1Stats.passedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Aprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-red-600">
                                        {preliminar1Stats.failedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Desaprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-purple-600">
                                        {preliminar1Stats.averageGrade.toFixed(1)}
                                      </div>
                                      <div className="text-xs text-gray-600">Promedio</div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>

                              {/* 1º Cuatrimestre */}
                              <Card className="border-indigo-200">
                                <CardHeader className="bg-indigo-50 pb-3">
                                  <CardTitle className="text-indigo-800 text-lg">1º Cuatrimestre</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-3">
                                  <div className="grid grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-indigo-600">
                                        {cuatrimestre1Stats.totalSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Total</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-green-600">
                                        {cuatrimestre1Stats.passedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Aprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-red-600">
                                        {cuatrimestre1Stats.failedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Desaprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-purple-600">
                                        {cuatrimestre1Stats.averageGrade.toFixed(1)}
                                      </div>
                                      <div className="text-xs text-gray-600">Promedio</div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>

                              {/* 2º Valoración Preliminar */}
                              <Card className="border-cyan-200">
                                <CardHeader className="bg-cyan-50 pb-3">
                                  <CardTitle className="text-cyan-800 text-lg">2º Valoración Preliminar</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-3">
                                  <div className="grid grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-cyan-600">
                                        {preliminar2Stats.totalSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Total</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-green-600">
                                        {preliminar2Stats.passedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Aprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-red-600">
                                        {preliminar2Stats.failedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Desaprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-purple-600">
                                        {preliminar2Stats.averageGrade.toFixed(1)}
                                      </div>
                                      <div className="text-xs text-gray-600">Promedio</div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>

                              {/* 2º Cuatrimestre */}
                              <Card className="border-teal-200">
                                <CardHeader className="bg-teal-50 pb-3">
                                  <CardTitle className="text-teal-800 text-lg">2º Cuatrimestre</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-3">
                                  <div className="grid grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-teal-600">
                                        {cuatrimestre2Stats.totalSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Total</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-green-600">
                                        {cuatrimestre2Stats.passedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Aprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-red-600">
                                        {cuatrimestre2Stats.failedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Desaprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-purple-600">
                                        {cuatrimestre2Stats.averageGrade.toFixed(1)}
                                      </div>
                                      <div className="text-xs text-gray-600">Promedio</div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>

                              {/* Calificación Final */}
                              <Card className="border-green-200">
                                <CardHeader className="bg-green-50 pb-3">
                                  <CardTitle className="text-green-800 text-lg">Calificación Final</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-3">
                                  <div className="grid grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-green-600">{finalStats.totalSubjects}</div>
                                      <div className="text-xs text-gray-600">Total</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-green-600">
                                        {finalStats.passedSubjects}
                                      </div>
                                      <div className="text-xs text-gray-600">Aprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-red-600">{finalStats.failedSubjects}</div>
                                      <div className="text-xs text-gray-600">Desaprobó</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-xl font-bold text-purple-600">
                                        {finalStats.averageGrade.toFixed(1)}
                                      </div>
                                      <div className="text-xs text-gray-600">Promedio</div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </TabsContent>

              <TabsContent value="statistics">
                <div className="grid gap-6">
                  {/* Estadísticas Generales */}
                  <Card className="border-green-200">
                    <CardHeader className="bg-green-50">
                      <CardTitle className="text-green-800">Estadísticas Generales</CardTitle>
                      <CardDescription>
                        Resumen de todas las materias y estudiantes
                        {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") &&
                          " (filtrado)"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">{filteredData.length}</div>
                          <div className="text-sm text-gray-600">
                            Materias{" "}
                            {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") &&
                              "Filtradas"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">{filteredStudents.length}</div>
                          <div className="text-sm text-gray-600">
                            Estudiantes{" "}
                            {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") &&
                              "Filtrados"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">{filteredCourses.length}</div>
                          <div className="text-sm text-gray-600">
                            Cursos{" "}
                            {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") &&
                              "Filtrados"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-orange-600">
                            {(() => {
                              let totalRecords = 0
                              filteredData.forEach((subject) => {
                                const studentsInSubject = subject.students.filter(
                                  (student) =>
                                    !searchStudent ||
                                    normalizeString(student.name).includes(normalizeString(searchStudent)),
                                )
                                totalRecords += studentsInSubject.length
                              })
                              return totalRecords
                            })()}
                          </div>
                          <div className="text-sm text-gray-600">
                            Registros{" "}
                            {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") &&
                              "Filtrados"}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sección de Alumnos con X Materias Desaprobadas */}
                  <Card className="border-red-200">
                    <CardHeader className="bg-red-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-red-800">Alumnos con Materias Desaprobadas</CardTitle>
                          <CardDescription className="text-red-700">
                            Lista de estudiantes con {minFailedSubjects || "0"} o más materias desaprobadas (
                            {getGradeTypeLabel(minFailedGradeType)})
                            {selectedCourse !== "all" && " (filtrado por curso)"}
                          </CardDescription>
                        </div>
                        <Button
                          onClick={exportStudentsWithFailedSubjects}
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-700 hover:bg-red-100 bg-transparent"
                          disabled={
                            filteredStudents.length === 0 ||
                            minFailedSubjects === "" ||
                            isNaN(Number(minFailedSubjects))
                          }
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Exportar Lista
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {filteredStudents.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">
                          <p>No se encontraron estudiantes que coincidan con los filtros aplicados.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {filteredStudents.map((studentName, studentIndex) => {
                            // For this section, we need to calculate stats based on the selected minFailedGradeType
                            // and ignore the searchSubject filter.
                            const studentSubjects = getStudentSubjectsFiltered(studentName, true)
                            const stats = getStudentOverallStatistics(
                              studentSubjects,
                              minFailedGradeType as keyof StudentGrade,
                            )

                            // The filtering for minFailedSubjects is already done in getFilteredStudents
                            // This map only renders the students that passed that filter.
                            return (
                              <div
                                key={studentIndex}
                                className="flex items-center justify-between p-4 bg-white rounded-lg border border-red-200"
                              >
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900">{studentName}</h4>
                                  <p className="text-sm text-gray-600">
                                    Materias desaprobadas ({getGradeTypeLabel(minFailedGradeType)}):{" "}
                                    <span className="font-bold text-red-600">{stats.failedSubjects}</span> de{" "}
                                    {stats.totalSubjects}
                                  </p>
                                </div>
                                <div className="text-center min-w-[80px]">
                                  <div className="text-lg font-bold text-purple-600">
                                    {stats.averageGrade.toFixed(1)}
                                  </div>
                                  <div className="text-xs text-gray-600">Promedio Final</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Estadísticas Globales por Tipo de Calificación */}
                  <Card className="border-green-200">
                    <CardHeader className="bg-green-50">
                      <CardTitle className="text-green-800">Resumen por Tipo de Evaluación</CardTitle>
                      <CardDescription>
                        Estadísticas globales de aprobación por cada tipo de calificación
                        {(searchStudent || searchSubject || selectedCourse !== "all" || minFailedSubjects !== "") &&
                          " (filtrado)"}
                        <br />
                        <span className="text-xs text-gray-500">
                          Haz clic en una tarjeta para ver el detalle por materia
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                          { key: "preliminar1", label: "1º Valoración Preliminar", color: "blue" },
                          { key: "cuatrimestre1", label: "1º Cuatrimestre", color: "indigo" },
                          { key: "preliminar2", label: "2º Valoración Preliminar", color: "cyan" },
                          { key: "cuatrimestre2", label: "2º Cuatrimestre", color: "teal" },
                          { key: "final", label: "Calificación Final", color: "green" },
                        ].map((gradeType) => {
                          let totalEvaluations = 0
                          let passedEvaluations = 0
                          let failedEvaluations = 0
                          let teaCount = 0

                          // Use filteredData which already excludes the specified subjects
                          filteredData.forEach((subject) => {
                            subject.students.forEach((student) => {
                              // Only consider students that pass the current filters
                              const studentPassesFilters = filteredStudents.includes(student.name)
                              if (!studentPassesFilters) return

                              const gradeStr = student[gradeType.key as keyof StudentGrade]
                                .toString()
                                .trim()
                                .toUpperCase()
                              const grade = Number.parseFloat(gradeStr)

                              if (gradeType.key === "preliminar1" || gradeType.key === "preliminar2") {
                                if (gradeStr === "TEA") {
                                  totalEvaluations++
                                  passedEvaluations++
                                  teaCount++
                                } else if (gradeStr === "TEP" || gradeStr === "TED") {
                                  totalEvaluations++
                                  failedEvaluations++
                                } else if (!isNaN(grade) && grade > 0) {
                                  totalEvaluations++
                                  if (grade >= 7) {
                                    passedEvaluations++
                                  } else {
                                    failedEvaluations++
                                  }
                                }
                              } else {
                                if (!isNaN(grade) && grade > 0) {
                                  totalEvaluations++
                                  if (grade >= 7) {
                                    passedEvaluations++
                                  } else {
                                    failedEvaluations++
                                  }
                                }
                              }
                            })
                          })

                          const approvalRate = totalEvaluations > 0 ? (passedEvaluations / totalEvaluations) * 100 : 0
                          const isExpanded = expandedEvaluationType === gradeType.key

                          return (
                            <Card
                              key={gradeType.key}
                              className={`border-gray-200 cursor-pointer transition-all duration-200 hover:shadow-md ${
                                isExpanded ? "ring-2 ring-blue-500" : ""
                              }`}
                              onClick={() => setExpandedEvaluationType(isExpanded ? null : gradeType.key)}
                            >
                              <CardHeader className="bg-gray-50 pb-3">
                                <CardTitle className="text-gray-800 text-sm font-medium flex items-center justify-between">
                                  {gradeType.label}
                                  <span className="text-xs text-gray-500">{isExpanded ? "▼" : "▶"}</span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-3">
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Total evaluaciones:</span>
                                    <span className="font-bold text-lg">{totalEvaluations}</span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="text-center p-2 bg-green-50 rounded">
                                      <div className="font-bold text-green-600">{passedEvaluations}</div>
                                      <div className="text-xs text-green-600">Aprobados</div>
                                      {teaCount > 0 && <div className="text-xs text-green-500">({teaCount} TEA)</div>}
                                    </div>
                                    <div className="text-center p-2 bg-red-50 rounded">
                                      <div className="font-bold text-red-600">{failedEvaluations}</div>
                                      <div className="text-xs text-red-600">Desaprobados</div>
                                    </div>
                                  </div>

                                  <div className="border-t pt-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-sm font-medium text-purple-600">Tasa de aprobación:</span>
                                      <span className="font-bold text-lg text-purple-600">
                                        {approvalRate.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                      <div
                                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${Math.min(approvalRate, 100)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Detalle por materia - aparece abajo cuando se selecciona un tipo de evaluación */}
                  {expandedEvaluationType && (
                    <Card className="border-blue-200 bg-blue-50">
                      <CardHeader className="bg-blue-100">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-blue-800">
                              Detalle por Materia -{" "}
                              {gradeTypeOptions.find((type) => type.value === expandedEvaluationType)?.label}
                            </CardTitle>
                            <CardDescription className="text-blue-700">
                              Estadísticas detalladas por cada materia para este tipo de evaluación
                            </CardDescription>
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => exportSubjectDetails(expandedEvaluationType)}
                              variant="outline"
                              size="sm"
                              className="border-blue-300 text-blue-700 hover:bg-blue-100 bg-transparent"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Exportar Detalle
                            </Button>
                            <Button
                              onClick={() => exportSubjectMatrix(expandedEvaluationType)}
                              variant="outline"
                              size="sm"
                              className="border-green-300 text-green-700 hover:bg-green-100 bg-transparent"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Exportar Materias
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          {(() => {
                            const subjectStats = new Map<
                              string,
                              {
                                subject: string
                                course: string
                                total: number
                                passed: number
                                failed: number
                                teaCount: number
                                approvalRate: number
                              }
                            >()

                            // Use filteredData which already excludes the specified subjects
                            filteredData.forEach((subject) => {
                              let subjectTotal = 0
                              let subjectPassed = 0
                              let subjectFailed = 0
                              let teaCount = 0

                              subject.students.forEach((student) => {
                                // Only consider students that pass the current filters
                                const studentPassesFilters = filteredStudents.includes(student.name)
                                if (!studentPassesFilters) return

                                const gradeStr = student[expandedEvaluationType as keyof StudentGrade]
                                  .toString()
                                  .trim()
                                  .toUpperCase()
                                const grade = Number.parseFloat(gradeStr)

                                if (
                                  expandedEvaluationType === "preliminar1" ||
                                  expandedEvaluationType === "preliminar2"
                                ) {
                                  if (gradeStr === "TEA") {
                                    subjectTotal++
                                    subjectPassed++
                                    teaCount++
                                  } else if (gradeStr === "TEP" || gradeStr === "TED") {
                                    subjectTotal++
                                    subjectFailed++
                                  } else if (!isNaN(grade) && grade > 0) {
                                    subjectTotal++
                                    if (grade >= 7) {
                                      subjectPassed++
                                    } else {
                                      subjectFailed++
                                    }
                                  }
                                } else {
                                  if (!isNaN(grade) && grade > 0) {
                                    subjectTotal++
                                    if (grade >= 7) {
                                      subjectPassed++
                                    } else {
                                      subjectFailed++
                                    }
                                  }
                                }
                              })

                              if (subjectTotal > 0) {
                                subjectStats.set(subject.subject, {
                                  subject: subject.subject,
                                  course: subject.course,
                                  total: subjectTotal,
                                  passed: subjectPassed,
                                  failed: subjectFailed,
                                  teaCount: teaCount,
                                  approvalRate: (subjectPassed / subjectTotal) * 100,
                                })
                              }
                            })

                            return Array.from(subjectStats.values())
                              .sort((a, b) => b.approvalRate - a.approvalRate)
                              .map((stat, index) => (
                                <div
                                  key={index}
                                  className="flex items-center justify-between p-4 bg-white rounded-lg border border-blue-200"
                                >
                                  <div className="flex-1">
                                    <h4 className="font-medium text-gray-900">{stat.subject}</h4>
                                    <p className="text-sm text-gray-600">
                                      {stat.total} estudiantes total ({stat.course})
                                    </p>
                                  </div>

                                  <div className="flex items-center space-x-6">
                                    <div className="text-center">
                                      <div className="text-lg font-bold text-green-600">{stat.passed}</div>
                                      <div className="text-xs text-gray-600">Aprobados</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-lg font-bold text-red-600">{stat.failed}</div>
                                      <div className="text-xs text-gray-600">Desaprobados</div>
                                    </div>
                                    <div className="text-center min-w-[60px]">
                                      <div className="text-lg font-bold text-purple-600">
                                        {stat.approvalRate.toFixed(1)}%
                                      </div>
                                      <div className="text-xs text-gray-600">Aprobación</div>
                                    </div>
                                  </div>
                                </div>
                              ))
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Estadísticas por Curso */}
                  {getGroupedCourses()
                    .filter((group) => {
                      // Filter courses based on whether they contain any subjects/students matching the filters
                      return group.subjects.some((file) => {
                        // Check if any student in this subject passes the global student filters
                        const hasMatchingStudent = file.students.some((student) =>
                          filteredStudents.includes(student.name),
                        )
                        if (!hasMatchingStudent) return false

                        // If minFailedFilter is active, ignore searchSubject for this check
                        if (
                          searchSubject &&
                          !isMinFailedFilterActive &&
                          !normalizeString(file.subject).includes(normalizeString(searchSubject))
                        ) {
                          return false
                        }
                        // Also exclude the specific subjects from the course statistics display
                        if (isExcludedSubject(file.subject)) {
                          return false
                        }
                        return true
                      })
                    })
                    .map((courseGroup, index) => {
                      const courseSubjects = courseGroup.subjects.filter((subject) => {
                        // Filter subjects within the course group based on global filters
                        const hasMatchingStudent = subject.students.some((student) =>
                          filteredStudents.includes(student.name),
                        )
                        if (!hasMatchingStudent) return false

                        // If minFailedFilter is active, ignore searchSubject for this check
                        if (
                          searchSubject &&
                          !isMinFailedFilterActive &&
                          !normalizeString(subject.subject).includes(normalizeString(searchSubject))
                        ) {
                          return false
                        }
                        // Also exclude the specific subjects from the course statistics display
                        if (isExcludedSubject(subject.subject)) {
                          return false
                        }
                        return true
                      })

                      // Calculate unique students in this filtered course group
                      const uniqueStudentsInCourse = new Set<string>()
                      courseSubjects.forEach((subject) => {
                        subject.students.forEach((student) => {
                          if (filteredStudents.includes(student.name)) {
                            // Only count students that pass global filters
                            uniqueStudentsInCourse.add(normalizeString(student.name))
                          }
                        })
                      })
                      const totalStudents = uniqueStudentsInCourse.size

                      let totalFinalGrades = 0
                      let passedFinalGrades = 0
                      let failedFinalGrades = 0

                      courseSubjects.forEach((subject) => {
                        subject.students.forEach((student) => {
                          if (filteredStudents.includes(student.name)) {
                            // Only count grades for students that pass global filters
                            const finalGradeStr = student.final.toString().trim()
                            const finalGrade = Number.parseFloat(finalGradeStr)

                            if (!isNaN(finalGrade) && finalGrade > 0) {
                              totalFinalGrades++
                              if (finalGrade >= 7) {
                                passedFinalGrades++
                              } else {
                                failedFinalGrades++
                              }
                            }
                          }
                        })
                      })

                      return (
                        <Card key={index} className="border-green-200">
                          <CardHeader className="bg-green-50">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-green-800">Curso: {courseGroup.normalizedName}</CardTitle>
                                <CardDescription>
                                  {courseSubjects.length} materias - {totalStudents} estudiantes únicos
                                  {courseGroup.originalNames.size > 1 && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Incluye: {Array.from(courseGroup.originalNames).join(", ")}
                                    </div>
                                  )}
                                  {(searchStudent ||
                                    searchSubject ||
                                    selectedCourse !== "all" ||
                                    minFailedSubjects !== "") &&
                                    " (filtrado)"}
                                </CardDescription>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-600">Calificaciones finales</div>
                                <div className="flex space-x-4 mt-1">
                                  <span className="text-green-600 font-bold">{passedFinalGrades} ✓</span>
                                  <span className="text-red-600 font-bold">{failedFinalGrades} ✗</span>
                                  <span className="text-purple-600 font-bold">
                                    {totalFinalGrades > 0
                                      ? ((passedFinalGrades / totalFinalGrades) * 100).toFixed(1)
                                      : "0.0"}
                                    %
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {courseSubjects.map((subject, subjectIndex) => {
                                const filteredStudentsInSubject = subject.students.filter(
                                  (student) => filteredStudents.includes(student.name), // Only count students that pass global filters
                                )

                                let passedCount = 0
                                let failedCount = 0
                                let totalWithGrades = 0
                                let noGradeCount = 0

                                filteredStudentsInSubject.forEach((student) => {
                                  const finalGradeStr = student.final.toString().trim()
                                  const finalGrade = Number.parseFloat(finalGradeStr)

                                  if (!isNaN(finalGrade) && finalGrade > 0) {
                                    totalWithGrades++
                                    if (finalGrade >= 7) {
                                      passedCount++
                                    } else {
                                      failedCount++
                                    }
                                  } else {
                                    noGradeCount++
                                  }
                                })

                                const approvalRate = totalWithGrades > 0 ? (passedCount / totalWithGrades) * 100 : 0

                                return (
                                  <div
                                    key={subjectIndex}
                                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                                  >
                                    <div className="flex-1">
                                      <h4 className="font-medium text-gray-900">{subject.subject}</h4>
                                      <p className="text-sm text-gray-600">
                                        {filteredStudentsInSubject.length} estudiantes total
                                        {subject.course !== courseGroup.normalizedName && (
                                          <span className="text-xs text-gray-500"> ({subject.course})</span>
                                        )}
                                      </p>
                                    </div>

                                    <div className="flex items-center space-x-6">
                                      <div className="text-center">
                                        <div className="text-lg font-bold text-green-600">{passedCount}</div>
                                        <div className="text-xs text-gray-600">Aprobados</div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-bold text-red-600">{failedCount}</div>
                                        <div className="text-xs text-gray-600">Desaprobados</div>
                                      </div>
                                      {noGradeCount > 0 && (
                                        <div className="text-center">
                                          <div className="text-lg font-bold text-gray-500">{noGradeCount}</div>
                                          <div className="text-xs text-gray-600">Sin calificar</div>
                                        </div>
                                      )}
                                      <div className="text-center min-w-[60px]">
                                        <div className="text-lg font-bold text-purple-600">
                                          {approvalRate.toFixed(1)}%
                                        </div>
                                        <div className="text-xs text-gray-600">Aprobación</div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}
