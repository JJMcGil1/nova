import { useState, useEffect } from 'react'
import { FiFolder, FiPlus, FiX } from 'react-icons/fi'
import { FaGithub } from 'react-icons/fa'

interface SettingsProps {
  projects: NovaProject[]
  onProjectsChange: (projects: NovaProject[]) => void
  onClose: () => void
}

export default function Settings({ projects, onProjectsChange, onClose }: SettingsProps) {
  const [tokenInput, setTokenInput] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle')
  const [tokenHint, setTokenHint] = useState('')
  const [githubUser, setGithubUser] = useState<{ username: string; avatarUrl: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [showRepos, setShowRepos] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const api = window.electronAPI?.settings
      if (!api) return

      const config = await api.getConfig()
      if (config.hasToken) {
        setTokenHint(config.tokenHint)
        setTokenStatus('connected')
        const user = await api.getGithubUser()
        if (user) setGithubUser(user)
      }
    }
    load()
  }, [])

  const connectToken = async () => {
    const api = window.electronAPI?.settings
    if (!api || !tokenInput.trim()) return

    setTokenStatus('loading')
    setErrorMsg('')

    const result = await api.setGithubToken(tokenInput.trim())
    if (result.success) {
      setTokenStatus('connected')
      setTokenHint(`ghp_...${tokenInput.trim().slice(-4)}`)
      setGithubUser(result.username ? { username: result.username, avatarUrl: result.avatarUrl || '' } : null)
      setTokenInput('')
    } else {
      setTokenStatus('error')
      setErrorMsg(result.error || 'Invalid token')
    }
  }

  const disconnectToken = async () => {
    const api = window.electronAPI?.settings
    if (!api) return
    await api.removeGithubToken()
    setTokenStatus('idle')
    setTokenHint('')
    setGithubUser(null)
    setRepos([])
    setShowRepos(false)
  }

  const loadRepos = async () => {
    const api = window.electronAPI?.settings
    if (!api) return
    setReposLoading(true)
    const result = await api.listGithubRepos()
    setRepos(result)
    setReposLoading(false)
    setShowRepos(true)
  }

  const addRepoAsProject = async (repo: GithubRepo) => {
    const api = window.electronAPI?.settings
    if (!api) return
    const project: NovaProject = {
      id: `gh-${repo.fullName}`,
      name: repo.name,
      githubRepo: repo.fullName,
    }
    const updated = await api.addProject(project)
    onProjectsChange(updated)
  }

  const addLocalFolder = async () => {
    const api = window.electronAPI?.settings
    if (!api) return
    const result = await api.pickFolder()
    if (!result) return
    const project: NovaProject = {
      id: `local-${result.path}`,
      name: result.name,
      path: result.path,
    }
    const updated = await api.addProject(project)
    onProjectsChange(updated)
  }

  const removeProject = async (id: string) => {
    const api = window.electronAPI?.settings
    if (!api) return
    const updated = await api.removeProject(id)
    onProjectsChange(updated)
  }

  const filteredRepos = repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase())),
  )

  const isRepoAdded = (repo: GithubRepo) => projects.some((p) => p.id === `gh-${repo.fullName}`)

  const isGithubProject = (p: NovaProject) => !!(p.githubRepo || p.github_repo)

  return (
    <div className="settings">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <button className="settings-close" onClick={onClose}>
          <FiX size={16} />
        </button>
      </div>

      <div className="settings-content">
        {/* GitHub Connection */}
        <section className="settings-section">
          <h3 className="settings-section-title">
            <FaGithub size={16} />
            GitHub Connection
          </h3>

          {tokenStatus === 'connected' ? (
            <div className="settings-github-connected">
              <div className="settings-github-user">
                {githubUser?.avatarUrl && (
                  <img src={githubUser.avatarUrl} alt="" className="settings-github-avatar" />
                )}
                <div className="settings-github-info">
                  <span className="settings-github-username">{githubUser?.username || 'Connected'}</span>
                  <span className="settings-github-token-hint">{tokenHint}</span>
                </div>
                <span className="settings-github-badge">Connected</span>
              </div>
              <div className="settings-github-actions">
                <button className="settings-btn settings-btn-secondary" onClick={loadRepos}>
                  {reposLoading ? 'Loading...' : 'Browse Repos'}
                </button>
                <button className="settings-btn settings-btn-danger" onClick={disconnectToken}>
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-github-connect">
              <p className="settings-hint">
                Enter a GitHub Personal Access Token to connect your repositories.
                <br />
                <span className="settings-hint-sub">
                  Create one at GitHub &rarr; Settings &rarr; Developer Settings &rarr; Personal Access Tokens
                </span>
              </p>
              <div className="settings-token-input-row">
                <input
                  type="password"
                  className="settings-input"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && connectToken()}
                />
                <button
                  className="settings-btn settings-btn-primary"
                  onClick={connectToken}
                  disabled={tokenStatus === 'loading' || !tokenInput.trim()}
                >
                  {tokenStatus === 'loading' ? 'Verifying...' : 'Connect'}
                </button>
              </div>
              {tokenStatus === 'error' && (
                <p className="settings-error">{errorMsg}</p>
              )}
            </div>
          )}

          {showRepos && (
            <div className="settings-repos">
              <input
                className="settings-input settings-repo-search"
                placeholder="Search repositories..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
              />
              <div className="settings-repo-list">
                {filteredRepos.map((repo) => (
                  <div key={repo.fullName} className="settings-repo-item">
                    <div className="settings-repo-info">
                      <span className="settings-repo-name">{repo.fullName}</span>
                      {repo.private && <span className="settings-repo-private">Private</span>}
                      {repo.description && (
                        <span className="settings-repo-desc">{repo.description}</span>
                      )}
                    </div>
                    <button
                      className={`settings-btn ${isRepoAdded(repo) ? 'settings-btn-added' : 'settings-btn-secondary'}`}
                      onClick={() => addRepoAsProject(repo)}
                      disabled={isRepoAdded(repo)}
                    >
                      {isRepoAdded(repo) ? 'Added' : 'Add'}
                    </button>
                  </div>
                ))}
                {filteredRepos.length === 0 && (
                  <p className="settings-repo-empty">No repositories found</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Projects */}
        <section className="settings-section">
          <h3 className="settings-section-title">
            <FiFolder size={16} />
            Projects
          </h3>

          <div className="settings-projects-actions">
            <button className="settings-btn settings-btn-secondary" onClick={addLocalFolder}>
              <FiPlus size={14} />
              Add Local Folder
            </button>
          </div>

          {projects.length > 0 ? (
            <div className="settings-project-list">
              {projects.map((project) => (
                <div key={project.id} className="settings-project-item">
                  <div className="settings-project-icon">
                    {isGithubProject(project) ? <FaGithub size={14} /> : <FiFolder size={14} />}
                  </div>
                  <div className="settings-project-info">
                    <span className="settings-project-name">{project.name}</span>
                    <span className="settings-project-path">
                      {project.githubRepo || project.github_repo || project.path}
                    </span>
                  </div>
                  <button
                    className="settings-project-remove"
                    onClick={() => removeProject(project.id)}
                    title="Remove project"
                  >
                    <FiX size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="settings-projects-empty">
              No projects yet. Add a local folder or connect a GitHub repo above.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
