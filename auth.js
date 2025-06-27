// Initialize Supabase client
//const supabaseUrl = 'https://bgdamsqiereardlqkfaf.supabase.co'
//const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnZGFtc3FpZXJlYXJkbHFrZmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MTY0NjcsImV4cCI6MjA2Mzk5MjQ2N30.kEZDCGAgWT2ommg6-5L6l0zDZAd4BdtG4WR8jS9iQeY'



function _0x1f7b(_0x27b8d0,_0x235974){const _0x4a3115=_0x4a31();return _0x1f7b=function(_0x1f7b93,_0x4b3473){_0x1f7b93=_0x1f7b93-0xb3;let _0x369d08=_0x4a3115[_0x1f7b93];return _0x369d08;},_0x1f7b(_0x27b8d0,_0x235974);}const _0x1f6962=_0x1f7b;function _0x4a31(){const _0x3ffd1e=['https://bgdamsqiereardlqkfaf.supabase.co','2428696hAiPLE','2VzcNox','4IclKdu','2414052NdfpDy','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnZGFtc3FpZXJlYXJkbHFrZmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MTY0NjcsImV4cCI6MjA2Mzk5MjQ2N30.kEZDCGAgWT2ommg6-5L6l0zDZAd4BdtG4WR8jS9iQeY','8453375LnXuJG','4304365tnageu','15175467QyWmiH','31661hDeUTP','1187013JoVXga'];_0x4a31=function(){return _0x3ffd1e;};return _0x4a31();}(function(_0x504288,_0x383555){const _0x2dbf28=_0x1f7b,_0x3d48c8=_0x504288();while(!![]){try{const _0x37d42f=-parseInt(_0x2dbf28(0xbc))/0x1+-parseInt(_0x2dbf28(0xb5))/0x2*(-parseInt(_0x2dbf28(0xbd))/0x3)+parseInt(_0x2dbf28(0xb6))/0x4*(-parseInt(_0x2dbf28(0xba))/0x5)+parseInt(_0x2dbf28(0xb7))/0x6+-parseInt(_0x2dbf28(0xb9))/0x7+parseInt(_0x2dbf28(0xb4))/0x8+parseInt(_0x2dbf28(0xbb))/0x9;if(_0x37d42f===_0x383555)break;else _0x3d48c8['push'](_0x3d48c8['shift']());}catch(_0x31be29){_0x3d48c8['push'](_0x3d48c8['shift']());}}}(_0x4a31,0xa7df4));const supabaseUrl=_0x1f6962(0xb3),supabaseKey=_0x1f6962(0xb8);


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

// Sign up with email/password
async function signUpWithEmail(email, password) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                emailRedirectTo: window.location.origin + '/profiles.html'
            }
        })
        if (error) throw error
        return { success: true, message: 'Check your email for confirmation link' }
    } catch (error) {
        console.error('Error signing up:', error.message)
        return { success: false, message: error.message }
    }
}

// Sign in with email/password
async function signInWithEmail(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        })
        if (error) throw error
        window.location.href = '/profiles.html'
    } catch (error) {
        console.error('Error signing in:', error.message)
        return { success: false, message: error.message }
    }
}

// Reset password
async function resetPassword(email) {
    try {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html'
        })
        if (error) throw error
        return { success: true, message: 'Check your email for password reset link' }
    } catch (error) {
        console.error('Error resetting password:', error.message)
        return { success: false, message: error.message }
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