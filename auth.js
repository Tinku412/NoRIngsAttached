// Initialize Supabase client
const supabaseUrl = 'https://bgdamsqiereardlqkfaf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnZGFtc3FpZXJlYXJkbHFrZmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MTY0NjcsImV4cCI6MjA2Mzk5MjQ2N30.kEZDCGAgWT2ommg6-5L6l0zDZAd4BdtG4WR8jS9iQeY'
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// Check if user is authenticated
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (!session) {
        window.location.href = 'login.html'
        return false
    }
    return true
}

// Sign in with Google
async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/profiles.html'
            }
        })
        if (error) throw error
    } catch (error) {
        console.error('Error signing in with Google:', error.message)
    }
}

// Sign out
async function signOut() {
    try {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        window.location.href = 'login.html'
    } catch (error) {
        console.error('Error signing out:', error.message)
    }
}

// Get current user
async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return user
} 