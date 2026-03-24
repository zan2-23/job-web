export interface Profile {
  id: string
  user_id: string
  nickname: string
  age: number
  job_type: '实习' | '校招' | '社招'
  target_position: string
}

export interface Review {
  id: string
  user_id: string
  content: string
  result: string
  created_at: string
}

export interface Resume {
  id: string
  user_id: string
  base_content: string
  jd_content: string
  generated_resume: string
  created_at: string
}

export interface InterviewPrep {
  id: string
  user_id: string
  jd_content: string
  intro_script: string
  questions: string
  created_at: string
}
