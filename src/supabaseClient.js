// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://foiwqlssrphcgizegyey.supabase.co';   // あなたのプロジェクトURL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvaXdxbHNzcnBoY2dpemVneWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjM4NzcyOTIsImV4cCI6MjAzOTQ1MzI5Mn0.M4Qn1rfdg2YfLxIGnFuFE_eYO053Z5KH5w7Ug_J2Ffo';  // anon publicキー

export const supabase = createClient(supabaseUrl, supabaseAnonKey);