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
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCourse, setSelectedCourse] = useState<string>("all")
  const [selectedGradeType, setSelectedGradeType] = useState<string>("final")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")

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
              if (
                !studentName.toLowerCase().includes("valoración") &&
                !studentName.toLowerCase().includes("calificación") &&
                studentName.length > 2
              ) {
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

      setFiles((prev) => [...prev, ...newFiles])
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

    if (searchTerm) {
      filtered = filtered.filter(
        (file) =>
          file.students.some((student) => student.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          file.subject.toLowerCase().includes(searchTerm.toLowerCase()),
      )
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

    // Filtrar por término de búsqueda
    if (searchTerm) {
      students = students.filter((studentName) => studentName.toLowerCase().includes(searchTerm.toLowerCase()))
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

    // Asegurar que cada estudiante tenga al menos una materia con los filtros aplicados
    return students.filter((studentName) => {
      const studentSubjects = getStudentSubjects(studentName)
      return studentSubjects.length > 0
    })
  }

  const getFilteredCourses = () => {
    const groupedCourses = getGroupedCourses()

    if (searchTerm) {
      return groupedCourses
        .filter((group) => {
          return group.subjects.some((file) =>
            file.students.some((student) => student.name.toLowerCase().includes(searchTerm.toLowerCase())),
          )
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

  const exportToExcel = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Datos")
    XLSX.writeFile(wb, `${filename}.xlsx`)
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
        if (!searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
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
      const calculateStatsForGradeType = (gradeType: keyof StudentGrade) => {
        let totalSubjects = 0
        let passedSubjects = 0
        let failedSubjects = 0

        const studentSubjects = getStudentSubjects(studentName)
        studentSubjects.forEach((item) => {
          if (item.studentData) {
            const gradeStr = item.studentData[gradeType].toString().trim()
            const grade = Number.parseFloat(gradeStr)
            const isTea = gradeStr.toUpperCase() === "TEA"

            if (!isNaN(grade) && grade > 0) {
              totalSubjects++
              if (grade >= 7) passedSubjects++
              else failedSubjects++
            } else if (isTea && (gradeType === "preliminar1" || gradeType === "preliminar2")) {
              totalSubjects++
              passedSubjects++
            }
          }
        })

        return { totalSubjects, passedSubjects, failedSubjects }
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
              {(searchTerm || selectedCourse !== "all") && (
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
                    Exportar {searchTerm || selectedCourse !== "all" ? "Filtrado" : "Todo"}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">Buscar estudiante o materia</label>
                    <Input
                      placeholder="Nombre del estudiante o materia..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
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
                {(searchTerm || selectedCourse !== "all") && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700">
                      <strong>Filtros activos:</strong>
                      {searchTerm && ` Búsqueda: "${searchTerm}"`}
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
                                    !searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase()),
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
                                    !searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase()),
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
                            const gradeStr = item.studentData[gradeType].toString().trim()
                            const grade = Number.parseFloat(gradeStr)
                            const isTea = gradeStr.toUpperCase() === "TEA"

                            if (!isNaN(grade) && grade > 0) {
                              totalSubjects++
                              totalGrades++
                              gradeSum += grade

                              if (grade >= 7) {
                                passedSubjects++
                              } else {
                                failedSubjects++
                              }
                            } else if (isTea && (gradeType === "preliminar1" || gradeType === "preliminar2")) {
                              totalSubjects++
                              passedSubjects++
                              // Para TEA no sumamos al promedio numérico
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
                                              const gradeStr = student.preliminar1.toString().trim()
                                              const grade = Number.parseFloat(gradeStr)
                                              const isPassed = !isNaN(grade) && grade >= 7
                                              const isTea = gradeStr.toUpperCase() === "TEA"

                                              return (
                                                <Badge
                                                  variant={isPassed || isTea ? "default" : "destructive"}
                                                  className={isPassed || isTea ? "bg-green-600" : ""}
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
                                              const gradeStr = student.preliminar2.toString().trim()
                                              const grade = Number.parseFloat(gradeStr)
                                              const isPassed = !isNaN(grade) && grade >= 7
                                              const isTea = gradeStr.toUpperCase() === "TEA"

                                              return (
                                                <Badge
                                                  variant={isPassed || isTea ? "default" : "destructive"}
                                                  className={isPassed || isTea ? "bg-green-600" : ""}
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
                        {(searchTerm || selectedCourse !== "all") && " (filtrado)"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">{filteredData.length}</div>
                          <div className="text-sm text-gray-600">
                            Materias {(searchTerm || selectedCourse !== "all") && "Filtradas"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">{filteredStudents.length}</div>
                          <div className="text-sm text-gray-600">
                            Estudiantes {(searchTerm || selectedCourse !== "all") && "Filtrados"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">{filteredCourses.length}</div>
                          <div className="text-sm text-gray-600">
                            Cursos {(searchTerm || selectedCourse !== "all") && "Filtrados"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-orange-600">
                            {(() => {
                              let totalRecords = 0
                              filteredData.forEach((subject) => {
                                const studentsInSubject = subject.students.filter(
                                  (student) =>
                                    !searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase()),
                                )
                                totalRecords += studentsInSubject.length
                              })
                              return totalRecords
                            })()}
                          </div>
                          <div className="text-sm text-gray-600">
                            Registros {(searchTerm || selectedCourse !== "all") && "Filtrados"}
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
                        {(searchTerm || selectedCourse !== "all") && " (filtrado)"}
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
                              if (!searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                                const gradeStr = student[gradeType.key as keyof StudentGrade].toString().trim()
                                const grade = Number.parseFloat(gradeStr)
                                const isTea = gradeStr.toUpperCase() === "TEA"

                                if (!isNaN(grade) && grade > 0) {
                                  totalEvaluations++
                                  if (grade >= 7) {
                                    passedEvaluations++
                                  } else {
                                    failedEvaluations++
                                  }
                                } else if (
                                  isTea &&
                                  (gradeType.key === "preliminar1" || gradeType.key === "preliminar2")
                                ) {
                                  totalEvaluations++
                                  passedEvaluations++
                                  teaCount++
                                }
                              }
                            })
                          })

                          const approvalRate = totalEvaluations > 0 ? (passedEvaluations / totalEvaluations) * 100 : 0

                          return (
                            <Card key={gradeType.key} className="border-gray-200">
                              <CardHeader className="bg-gray-50 pb-3">
                                <CardTitle className="text-gray-800 text-sm font-medium">{gradeType.label}</CardTitle>
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

                  {/* Estadísticas por Curso */}
                  {getGroupedCourses()
                    .filter((group) => {
                      if (searchTerm) {
                        return group.subjects.some((file) =>
                          file.students.some((student) =>
                            student.name.toLowerCase().includes(searchTerm.toLowerCase()),
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
                        if (searchTerm) {
                          return (
                            subject.students.some((student) =>
                              student.name.toLowerCase().includes(searchTerm.toLowerCase()),
                            ) || subject.subject.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                        }
                        return true
                      })

                      // Calcular estudiantes únicos en este curso agrupado
                      const uniqueStudentsInCourse = new Set()
                      courseSubjects.forEach((subject) => {
                        subject.students.forEach((student) => {
                          if (!searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
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
                          if (!searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
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
                                  {(searchTerm || selectedCourse !== "all") && " (filtrado)"}
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
                                    !searchTerm || student.name.toLowerCase().includes(searchTerm.toLowerCase()),
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
