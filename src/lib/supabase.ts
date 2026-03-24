import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pjfdizbugmglzzhcbnoo.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqZmRpemJ1Z21nbHp6aGNibm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODEzMTksImV4cCI6MjA4OTU1NzMxOX0.PNPyePPvOqT9i2ZRNfWrnjonWxb2mRtV9Phw56_0zKM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
