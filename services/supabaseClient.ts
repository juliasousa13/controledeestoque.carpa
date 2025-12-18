
import { createClient } from '@supabase/supabase-js';

// Conexão vinculada ao projeto: xjefjewxrjrjclefiovj
const SUPABASE_URL = 'https://xjefjewxrjrjclefiovj.supabase.co';
// Chave Anon padrão para este projeto
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZWZqZXd4cmpyamNsZWZpb3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDE2MTAsImV4cCI6MjA4MDUxNzYxMH0.ouguvTV-uI_B1cATW5X6w2MgHqboP8Y5NyaAHKbBEm8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
