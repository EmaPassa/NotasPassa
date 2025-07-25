"use client"

import type React from "react"

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
  averageGrade: number
}

export default function StudentGradesApp() {
  const [files, setFiles] = useState<SubjectData[]>([])
  const [searchStudent, setSearchStudent] = useState("")
  const [searchSubject, setSearchSubject] = useState("")
  const [selectedCourse, setSelectedCourse] = useState<string>("all")
  const [selectedGradeType, setSelectedGradeType] = useState<string>("final")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [expandedEvaluationType, setExpandedEvaluationType] = useState<string | null>(null)

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

        // Procesar cada hoja (materia)
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

          // Extraer información del curso (fila 7)
          const courseInfo = jsonData[6] as string[] // Fila 7 (índice 6)
          let year = "",
            section = ""

          if (courseInfo) {
            const yearCell = courseInfo.find((cell, index) => typeof cell === "string" && cell.includes("AÑO:"))
            const sectionCell = courseInfo.find((cell, index) => typeof cell === "string" && cell.includes("SECCIÓN:"))

            if (yearCell) year = yearCell.replace("AÑO:", "").trim()
            if (sectionCell) section = sectionCell.replace("SECCIÓN:", "").trim()
          }

          const course = `${year} ${section}`.trim()

          // Extraer datos de estudiantes (a partir de fila 10)
          const students: StudentGrade[] = []

          for (let row = 10; row < jsonData.length; row++) {
            const rowData = jsonData[row] as any[]
            if (rowData && rowData[1] && typeof rowData[1] === "string" && rowData[1].trim()) {
              // Verificar que no sea una fila de encabezado o descripción
              const studentName = rowData[1].toString().trim()

              // Lista de títulos que NO deben considerarse como estudiantes
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

              // Verificar que no sea una fila de encabezado, descripción o total
              const isValidStudentName =
                studentName.length > 2 &&
                !excludedTitles.some((title) => studentName.toUpperCase().includes(title.toUpperCase())) &&
                !studentName.toLowerCase().includes("valoración") &&
                !studentName.toLowerCase().includes("calificación")

              if (isValidStudentName) {
                const student: StudentGrade = {
                  name: studentName,
                  preliminar1: cleanGradeValue(rowData[8]), // Columna I
                  cuatrimestre1: cleanGradeValue(rowData[9]), // Columna J
                  preliminar2: cleanGradeValue(rowData[16]), // Columna Q
                  cuatrimestre2: cleanGradeValue(rowData[17]), // Columna R
                  final: cleanGradeValue(rowData[22]), // Columna W
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

      const processedFiles = processWorkshopSubjects(newFiles)
      setFiles((prev) => [...prev, ...processedFiles])
    } catch (err) {
      setError("Error al procesar los archivos Excel. Verifique el formato.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getFilteredData = () => {
    let filtered = files

    if (selectedCourse !== "all") {
      // Si el curso seleccionado es normalizado, filtrar por todos los cursos que se normalizan a ese valor
      const groupedCourses = getGroupedCourses()
      const selectedGroup = groupedCourses.find((group) => group.normalizedName === selectedCourse)

      if (selectedGroup) {
        filtered = filtered.filter((file) => Array.from(selectedGroup.originalNames).includes(file.course))
      } else {
        // Fallback para compatibilidad
        filtered = filtered.filter((file) => file.course === selectedCourse)
      }
    }

    if (searchStudent || searchSubject) {
      filtered = filtered.filter((file) => {
        const matchesStudent =
          !searchStudent ||
          file.students.some((student) => student.name.toLowerCase().includes(searchStudent.toLowerCase()))
        const matchesSubject = !searchSubject || file.subject.toLowerCase().includes(searchSubject.toLowerCase())

        // Si ambos campos tienen valores, ambos deben coincidir
        if (searchStudent && searchSubject) {
          return matchesStudent && matchesSubject
        }
        // Si solo uno tiene valor, solo ese debe coincidir
        return matchesStudent || matchesSubject
      })
    }

    return filtered
  }

  const getStudentSubjects = (studentName: string) => {
    let studentFiles = files.filter((file) =>
      file.students.some((student) => student.name.toLowerCase().trim() === studentName.toLowerCase().trim()),
    )

    // Aplicar filtro de curso si está seleccionado
    if (selectedCourse !== "all") {
      const groupedCourses = getGroupedCourses()
      const selectedGroup = groupedCourses.find((group) => group.normalizedName === selectedCourse)

      if (selectedGroup) {
        studentFiles = studentFiles.filter((file) => Array.from(selectedGroup.originalNames).includes(file.course))
      }
    }

    return studentFiles
      .map((subject) => {
        const student = subject.students.find((s) => s.name.toLowerCase().trim() === studentName.toLowerCase().trim())
        return {
          ...subject,
          studentData: student,
        }
      })
      .filter((item) => item.studentData)
  }

  const getFilteredStudents = () => {
    let students = getUniqueStudents()

    // Filtrar por término de búsqueda de estudiante
    if (searchStudent) {
      students = students.filter((studentName) => studentName.toLowerCase().includes(searchStudent.toLowerCase()))
    }

    // Filtrar por curso si está seleccionado - usar la nueva lógica de agrupamiento
    if (selectedCourse !== "all") {
      const groupedCourses = getGroupedCourses()
      const selectedGroup = groupedCourses.find((group) => group.normalizedName === selectedCourse)

      if (selectedGroup) {
        students = students.filter((studentName) => {
          return Array.from(selectedGroup.originalNames).some((originalCourse) =>
            files.some(
              (file) =>
                file.course === originalCourse &&
                file.students.some((student) => student.name.toLowerCase().trim() === studentName.toLowerCase().trim()),
            ),
          )
        })
      }
    }

    // Filtrar por materia si está especificado
    if (searchSubject) {
      students = students.filter((studentName) => {
        return files.some(
          (file) =>
            file.subject.toLowerCase().includes(searchSubject.toLowerCase()) &&
            file.students.some((student) => student.name.toLowerCase().trim() === studentName.toLowerCase().trim()),
        )
      })
    }

    // Asegurar que cada estudiante tenga al menos una materia con los filtros aplicados
    return students.filter((studentName) => {
      const studentSubjects = getStudentSubjects(studentName)
      return studentSubjects.length > 0
    })
  }

  const getFilteredCourses = () => {
    const groupedCourses = getGroupedCourses()

    if (searchStudent || searchSubject) {
      return groupedCourses
        .filter((group) => {
          return group.subjects.some((file) => {
            const matchesStudent =
              !searchStudent ||
              file.students.some((student) => student.name.toLowerCase().includes(searchStudent.toLowerCase()))
            const matchesSubject = !searchSubject || file.subject.toLowerCase().includes(searchSubject.toLowerCase())

            if (searchStudent && searchSubject) {
              return matchesStudent && matchesSubject
            }
            return matchesStudent || matchesSubject
          })
        })
        .map((group) => group.normalizedName)
    }

    return groupedCourses.map((group) => group.normalizedName)
  }

  const getStudentStatistics = (studentName: string): Statistics => {
    const studentSubjects = files.filter((file) =>
      file.students.some((student) => student.name.toLowerCase().includes(studentName.toLowerCase())),
    )

    let totalSubjects = 0
    let passedSubjects = 0
    let totalGrades = 0
    let gradeSum = 0

    studentSubjects.forEach((subject) => {
      const student = subject.students.find((s) => s.name.toLowerCase().includes(studentName.toLowerCase()))

      if (student) {
        const finalGrade = Number.parseFloat(student.final.toString())
        if (!isNaN(finalGrade)) {
          totalSubjects++
          totalGrades++
          gradeSum += finalGrade

          if (finalGrade >= 7) {
            passedSubjects++
          }
        }
      }
    })

    return {
      totalSubjects,
      passedSubjects,
      failedSubjects: totalSubjects - passedSubjects,
      averageGrade: totalGrades > 0 ? gradeSum / totalGrades : 0,
    }
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
    switch (type) {
      case "preliminar1":
        return "1º Valoración Preliminar"
      case "cuatrimestre1":
        return "Calificación 1º Cuatrimestre"
      case "preliminar2":
        return "2º Valoración Preliminar"
      case "cuatrimestre2":
        return "Calificación 2º Cuatrimestre"
      case "final":
        return "Calificación Final"
      default:
        return "Calificación Final"
    }
  }

  const cleanGradeValue = (value: any): string | number => {
    if (!value) return ""

    const strValue = value.toString().trim()

    // Si contiene texto descriptivo largo, devolver vacío
    if (strValue.length > 10 && strValue.toLowerCase().includes("valoración")) {
      return ""
    }

    // Si es un número, devolverlo
    const numValue = Number.parseFloat(strValue)
    if (!isNaN(numValue)) {
      return numValue
    }

    // Si es TEA u otra calificación especial corta, devolverla
    if (strValue.length <= 5) {
      return strValue.toUpperCase()
    }

    return ""
  }

  const normalizeCourse = (course: string): string => {
    if (!course || !course.trim()) return "Sin curso"

    const cleanCourse = course.trim().toUpperCase()

    // Extraer año y sección usando regex
    const match = cleanCourse.match(/(\d+).*?(\d+)/)

    if (match) {
      const year = match[1]
      const section = match[2]
      return `${year}° ${section}`
    }

    // Si no coincide con el patrón esperado, devolver el curso original limpio
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
      // Ordenar por año y luego por sección
      const aMatch = a.normalizedName.match(/(\d+)° (\d+)/)
      const bMatch = b.normalizedName.match(/(\d+)° (\d+)/)

      if (aMatch && bMatch) {
        const aYear = Number.parseInt(aMatch[1])
        const bYear = Number.parseInt(bMatch[1])
        if (aYear !== bYear) return aYear - bYear

        const aSection = Number.parseInt(aMatch[2])
        const bSection = Number.parseInt(bMatch[2])
        return aSection - bSection
      }

      return a.normalizedName.localeCompare(b.normalizedName)
    })
  }

  const processWorkshopSubjects = (files: SubjectData[]): SubjectData[] => {
    const processedFiles = [...files]

    // Agrupar por curso
    const courseGroups = new Map<string, SubjectData[]>()

    processedFiles.forEach((file) => {
      const course = file.course
      if (!courseGroups.has(course)) {
        courseGroups.set(course, [])
      }
      courseGroups.get(course)!.push(file)
    })

    // Procesar cada curso
    courseGroups.forEach((subjects, course) => {
      // Buscar materias de taller
      const workshopSubjects = subjects.filter((subject) => {
        const subjectName = subject.subject.toLowerCase()
        return (
          subjectName.includes("lenguajes tecnológicos") ||
          subjectName.includes("sistemas tecnológicos") ||
          subjectName.includes("procedimientos técnicos")
        )
      })

      if (workshopSubjects.length === 0) return

      // Obtener todos los estudiantes únicos de las materias de taller
      const allStudents = new Set<string>()
      workshopSubjects.forEach((subject) => {
        subject.students.forEach((student) => {
          allStudents.add(student.name)
        })
      })

      // Crear estudiantes para TALLER - General
      const tallerStudents: StudentGrade[] = []

      allStudents.forEach((studentName) => {
        const studentWorkshopGrades = workshopSubjects
          .map((subject) => {
            return subject.students.find((s) => s.name === studentName)
          })
          .filter(Boolean)

        if (studentWorkshopGrades.length === 0) return

        // Calcular promedio 1º Cuatrimestre
        const cuatrimestre1Grades = studentWorkshopGrades
          .map((student) => {
            const grade = Number.parseFloat(student!.cuatrimestre1.toString())
            return isNaN(grade) ? null : grade
          })
          .filter((grade) => grade !== null && grade > 0) as number[]

        // Calcular promedio 2º Cuatrimestre
        const cuatrimestre2Grades = studentWorkshopGrades
          .map((student) => {
            const grade = Number.parseFloat(student!.cuatrimestre2.toString())
            return isNaN(grade) ? null : grade
          })
          .filter((grade) => grade !== null && grade > 0) as number[]

        // Función para redondear según la regla especificada
        const customRound = (num: number): number => {
          const decimal = num - Math.floor(num)
          if (decimal >= 0.5) {
            return Math.ceil(num)
          } else {
            return Math.floor(num)
          }
        }

        // Calcular promedios
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

        // Calcular calificación final (promedio de los dos cuatrimestres de TALLER)
        let finalGrade = ""
        if (cuatrimestre1Average && cuatrimestre2Average) {
          const avg = (Number.parseFloat(cuatrimestre1Average) + Number.parseFloat(cuatrimestre2Average)) / 2
          finalGrade = customRound(avg).toString()
        } else if (cuatrimestre1Average && !cuatrimestre2Average) {
          // Si solo hay 1º cuatrimestre, usar esa nota como final
          finalGrade = cuatrimestre1Average
        } else if (!cuatrimestre1Average && cuatrimestre2Average) {
          // Si solo hay 2º cuatrimestre, usar esa nota como final
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

      // Agregar la materia TALLER - General si hay estudiantes
      if (tallerStudents.length > 0) {
        processedFiles.push({
          subject: "TALLER - General",
          course: course,
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

      // Use the browser-compatible writeFile method
      XLSX.writeFile(wb, `${filename}.xlsx`)
    } catch (error) {
      console.error("Error al exportar:", error)
      alert("Error al exportar el archivo. Por favor, intente nuevamente.")
    }
  }

  const exportStudentData = (studentName: string) => {
    const studentSubjects = getStudentSubjects(studentName)
    const exportData = studentSubjects.map((item) => ({
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
    const filteredFiles = getFilteredData()
    const allData: any[] = []

    filteredFiles.forEach((subject) => {
      subject.students.forEach((student) => {
        // Solo incluir si el estudiante coincide con la búsqueda
        if (!searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase())) {
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
    const filteredStudents = getFilteredStudents()
    const statsData: any[] = []

    filteredStudents.forEach((studentName) => {
      const studentSubjects = getStudentSubjects(studentName)

      const calculateStatsForGradeType = (gradeType: keyof StudentGrade) => {
        let totalSubjects = 0
        let passedSubjects = 0
        let failedSubjects = 0
        let totalGrades = 0
        let gradeSum = 0

        studentSubjects.forEach((item) => {
          if (item.studentData) {
            const gradeStr = item.studentData[gradeType].toString().trim().toUpperCase()
            const grade = Number.parseFloat(gradeStr)

            // Para valoraciones preliminares
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
              // Para cuatrimestres y final, solo números
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

  const exportSubjectDetails = (gradeTypeKey: string) => {
    const gradeTypeLabel =
      [
        { key: "preliminar1", label: "1º Valoración Preliminar" },
        { key: "cuatrimestre1", label: "1º Cuatrimestre" },
        { key: "preliminar2", label: "2º Valoración Preliminar" },
        { key: "cuatrimestre2", label: "2º Cuatrimestre" },
        { key: "final", label: "Calificación Final" },
      ].find((type) => type.key === gradeTypeKey)?.label || "Detalle de Evaluación"

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

    filteredData.forEach((subject) => {
      let subjectTotal = 0
      let subjectPassed = 0
      let subjectFailed = 0
      let subjectTea = 0

      subject.students.forEach((student) => {
        if (!searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase())) {
          const gradeStr = student[gradeTypeKey as keyof StudentGrade].toString().trim().toUpperCase()
          const grade = Number.parseFloat(gradeStr)

          if (gradeTypeKey === "preliminar1" || gradeTypeKey === "preliminar2") {
            if (gradeStr === "TEA") {
              subjectTotal++
              subjectPassed++
              subjectTea++
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
        }
      })

      if (subjectTotal > 0) {
        subjectStats.set(subject.subject, {
          subject: subject.subject,
          course: subject.course,
          total: subjectTotal,
          passed: subjectPassed,
          failed: subjectFailed,
          teaCount: subjectTea,
          approvalRate: (subjectPassed / subjectTotal) * 100,
        })
      }
    })

    const exportData = Array.from(subjectStats.values())
      .sort((a, b) => b.approvalRate - a.approvalRate)
      .map((stat) => ({
        Materia: stat.subject,
        Curso: stat.course,
        "Total Evaluaciones": stat.total,
        Aprobados: stat.passed,
        Desaprobados: stat.failed,
        ...(gradeTypeKey === "preliminar1" || gradeTypeKey === "preliminar2" ? { "TEA Count": stat.teaCount } : {}),
        "Tasa de Aprobación (%)": stat.approvalRate.toFixed(1),
      }))

    exportToExcel(exportData, `Detalle_Materias_${gradeTypeLabel.replace(/\s+/g, "_")}`)
  }

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
              {(searchStudent || searchSubject || selectedCourse !== "all") && (
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
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">Buscar materia</label>
                    <Input
                      placeholder="Nombre de la materia..."
                      value={searchSubject}
                      onChange={(e) => setSearchSubject(e.target.value)}
                      className="border-green-300 focus:border-green-500"
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
                    <Select value={selectedGradeType} onValueChange={setSelectedGradeType}>
                      <SelectTrigger className="border-green-300 focus:border-green-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preliminar1">1º Valoración Preliminar</SelectItem>
                        <SelectItem value="cuatrimestre1">Calificación 1º Cuatrimestre</SelectItem>
                        <SelectItem value="preliminar2">2º Valoración Preliminar</SelectItem>
                        <SelectItem value="cuatrimestre2">Calificación 2º Cuatrimestre</SelectItem>
                        <SelectItem value="final">Calificación Final</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(searchStudent || searchSubject || selectedCourse !== "all") && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700">
                      <strong>Filtros activos:</strong>
                      {searchStudent && ` Estudiante: "${searchStudent}"`}
                      {searchSubject && ` Materia: "${searchSubject}"`}
                      {selectedCourse !== "all" && ` | Curso: ${selectedCourse}`}
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
                                Curso: {subject.course} | {getGradeTypeLabel(selectedGradeType)}
                              </CardDescription>
                            </div>
                            <Badge className="bg-green-600">
                              {
                                subject.students.filter(
                                  (student) =>
                                    !searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase()),
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
                                <TableHead className="text-center">{getGradeTypeLabel(selectedGradeType)}</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subject.students
                                .filter(
                                  (student) =>
                                    !searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase()),
                                )
                                .map((student, studentIndex) => {
                                  const grade = getGradeValue(student, selectedGradeType)
                                  const gradeStr = grade.toString().trim()
                                  const numericGrade = Number.parseFloat(gradeStr)
                                  const isTea = gradeStr.toUpperCase() === "TEA"
                                  const isPassed =
                                    (!isNaN(numericGrade) && numericGrade >= 7) ||
                                    (isTea &&
                                      (selectedGradeType === "preliminar1" || selectedGradeType === "preliminar2"))

                                  return (
                                    <TableRow key={studentIndex}>
                                      <TableCell className="font-medium">{student.name}</TableCell>
                                      <TableCell className="text-center">
                                        <Badge
                                          variant={isPassed ? "default" : "destructive"}
                                          className={isPassed ? "bg-green-600" : ""}
                                        >
                                          {grade || "N/A"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Badge
                                          variant={isPassed ? "default" : "destructive"}
                                          className={isPassed ? "bg-green-100 text-green-800" : ""}
                                        >
                                          {isPassed ? "Aprobado" : "Desaprobado"}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
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
                      const studentSubjects = getStudentSubjects(studentName)

                      // Función para calcular estadísticas por tipo de calificación
                      const calculateStatsForGradeType = (gradeType: keyof StudentGrade) => {
                        let totalSubjects = 0
                        let passedSubjects = 0
                        let failedSubjects = 0
                        let totalGrades = 0
                        let gradeSum = 0

                        studentSubjects.forEach((item) => {
                          if (item.studentData) {
                            const gradeStr = item.studentData[gradeType].toString().trim().toUpperCase()
                            const grade = Number.parseFloat(gradeStr)

                            // Para valoraciones preliminares
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
                              // Para cuatrimestres y final, solo números
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

                      // Calcular estadísticas para cada tipo de calificación
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
                                Calificaciones ({studentSubjects.length} materias)
                              </h4>
                              {studentSubjects.length > 0 ? (
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
                                    {studentSubjects.map((item, subjectIndex) => {
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
                        {(searchStudent || searchSubject || selectedCourse !== "all") && " (filtrado)"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">{filteredData.length}</div>
                          <div className="text-sm text-gray-600">
                            Materias {(searchStudent || searchSubject || selectedCourse !== "all") && "Filtradas"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">{filteredStudents.length}</div>
                          <div className="text-sm text-gray-600">
                            Estudiantes {(searchStudent || searchSubject || selectedCourse !== "all") && "Filtrados"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">{filteredCourses.length}</div>
                          <div className="text-sm text-gray-600">
                            Cursos {(searchStudent || searchSubject || selectedCourse !== "all") && "Filtrados"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-orange-600">
                            {(() => {
                              let totalRecords = 0
                              filteredData.forEach((subject) => {
                                const studentsInSubject = subject.students.filter(
                                  (student) =>
                                    !searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase()),
                                )
                                totalRecords += studentsInSubject.length
                              })
                              return totalRecords
                            })()}
                          </div>
                          <div className="text-sm text-gray-600">
                            Registros {(searchStudent || searchSubject || selectedCourse !== "all") && "Filtrados"}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Estadísticas Globales por Tipo de Calificación */}
                  <Card className="border-green-200">
                    <CardHeader className="bg-green-50">
                      <CardTitle className="text-green-800">Resumen por Tipo de Evaluación</CardTitle>
                      <CardDescription>
                        Estadísticas globales de aprobación por cada tipo de calificación
                        {(searchStudent || searchSubject || selectedCourse !== "all") && " (filtrado)"}
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

                          filteredData.forEach((subject) => {
                            subject.students.forEach((student) => {
                              if (!searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase())) {
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
                          {" "}
                          {/* Added flex container */}
                          <div>
                            <CardTitle className="text-blue-800">
                              Detalle por Materia -{" "}
                              {
                                [
                                  { key: "preliminar1", label: "1º Valoración Preliminar" },
                                  { key: "cuatrimestre1", label: "1º Cuatrimestre" },
                                  { key: "preliminar2", label: "2º Valoración Preliminar" },
                                  { key: "cuatrimestre2", label: "2º Cuatrimestre" },
                                  { key: "final", label: "Calificación Final" },
                                ].find((type) => type.key === expandedEvaluationType)?.label
                              }
                            </CardTitle>
                            <CardDescription className="text-blue-700">
                              Estadísticas detalladas por cada materia para este tipo de evaluación
                            </CardDescription>
                          </div>
                          <Button
                            onClick={() => exportSubjectDetails(expandedEvaluationType)}
                            variant="outline"
                            size="sm"
                            className="border-blue-300 text-blue-700 hover:bg-blue-100 bg-transparent"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Exportar Detalle
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          {(() => {
                            // Calcular estadísticas por materia para el tipo de evaluación seleccionado
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

                            filteredData.forEach((subject) => {
                              let subjectTotal = 0
                              let subjectPassed = 0
                              let subjectFailed = 0
                              let subjectTea = 0

                              subject.students.forEach((student) => {
                                if (
                                  !searchStudent ||
                                  student.name.toLowerCase().includes(searchStudent.toLowerCase())
                                ) {
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
                                      subjectTea++
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
                                }
                              })

                              if (subjectTotal > 0) {
                                subjectStats.set(subject.subject, {
                                  subject: subject.subject,
                                  course: subject.course,
                                  total: subjectTotal,
                                  passed: subjectPassed,
                                  failed: subjectFailed,
                                  teaCount: subjectTea,
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
                                      {stat.teaCount > 0 && (
                                        <div className="text-xs text-green-500">({stat.teaCount} TEA)</div>
                                      )}
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
                      if (searchStudent || searchSubject) {
                        return group.subjects.some((file) =>
                          file.students.some((student) =>
                            student.name.toLowerCase().includes(searchStudent.toLowerCase()),
                          ),
                        )
                      }
                      return true
                    })
                    .map((courseGroup, index) => {
                      const courseSubjects = courseGroup.subjects.filter((subject) => {
                        // Aplicar filtros adicionales si es necesario
                        if (selectedCourse !== "all" && courseGroup.normalizedName !== selectedCourse) {
                          return false
                        }
                        if (searchStudent || searchSubject) {
                          return (
                            subject.students.some((student) =>
                              student.name.toLowerCase().includes(searchStudent.toLowerCase()),
                            ) || subject.subject.toLowerCase().includes(searchSubject.toLowerCase())
                          )
                        }
                        return true
                      })

                      // Calcular estudiantes únicos en este curso agrupado
                      const uniqueStudentsInCourse = new Set()
                      courseSubjects.forEach((subject) => {
                        subject.students.forEach((student) => {
                          if (!searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase())) {
                            uniqueStudentsInCourse.add(student.name.toLowerCase().trim())
                          }
                        })
                      })
                      const totalStudents = uniqueStudentsInCourse.size

                      // Calcular estadísticas generales del curso
                      let totalFinalGrades = 0
                      let passedFinalGrades = 0
                      let failedFinalGrades = 0

                      courseSubjects.forEach((subject) => {
                        subject.students.forEach((student) => {
                          if (!searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase())) {
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
                                  {(searchStudent || searchSubject || selectedCourse !== "all") && " (filtrado)"}
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
                                  (student) =>
                                    !searchStudent || student.name.toLowerCase().includes(searchStudent.toLowerCase()),
                                )

                                // Calcular estadísticas de la materia
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
