(() => {
  'use strict'

  const themes = ['auto', 'light', 'dark']
  const themeLabels = { auto: 'System theme', light: 'Light theme', dark: 'Dark theme' }

  const getStoredTheme = () => localStorage.getItem('theme') || 'auto'
  const setStoredTheme = theme => localStorage.setItem('theme', theme)

  const getEffectiveTheme = (theme) => {
    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme
  }

  const setTheme = theme => {
    const effective = getEffectiveTheme(theme)
    if (effective === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const showActiveIcon = (theme) => {
    const sunIcon = document.getElementById('theme-icon-sun')
    const moonIcon = document.getElementById('theme-icon-moon')
    const autoIcon = document.getElementById('theme-icon-auto')
    const toggleBtn = document.getElementById('theme-toggle')

    sunIcon?.classList.add('hidden')
    moonIcon?.classList.add('hidden')
    autoIcon?.classList.add('hidden')

    if (theme === 'light') {
      sunIcon?.classList.remove('hidden')
    } else if (theme === 'dark') {
      moonIcon?.classList.remove('hidden')
    } else {
      autoIcon?.classList.remove('hidden')
    }

    // Update aria-label to announce current theme state
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', `${themeLabels[theme]}. Click to change.`)
    }
  }

  const cycleTheme = () => {
    const current = getStoredTheme()
    const currentIndex = themes.indexOf(current)
    const nextIndex = (currentIndex + 1) % themes.length
    const nextTheme = themes[nextIndex]

    setStoredTheme(nextTheme)
    setTheme(nextTheme)
    showActiveIcon(nextTheme)
  }

  // Set theme immediately to prevent flash
  setTheme(getStoredTheme())

  // Listen for system preference changes when in auto mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'auto') {
      setTheme('auto')
    }
  })

  // Initialize when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    showActiveIcon(getStoredTheme())

    const toggleBtn = document.getElementById('theme-toggle')
    toggleBtn?.addEventListener('click', cycleTheme)

    // Mobile hamburger menu toggle
    const menuBtn = document.getElementById('menu-toggle')
    const navMenu = document.getElementById('nav-menu')
    menuBtn?.addEventListener('click', () => {
      const isOpen = navMenu?.classList.toggle('open')
      menuBtn.setAttribute('aria-expanded', String(isOpen))
      navMenu?.setAttribute('aria-hidden', String(!isOpen))
    })
  })
})()