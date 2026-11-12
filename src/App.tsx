import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  supabase,
  BuiltSellListing,
  BuiltSellProfile,
  AssetCategory,
  computeSha256Fingerprint,
  formatBytes,
} from './lib/supabase';
import {
  Cpu,
  Sparkles,
  Code2,
  Lock,
  UserPlus,
  LogIn,
  LogOut,
  PlusCircle,
  Search,
  CheckCircle2,
  Copy,
  Check,
  Crown,
  ExternalLink,
  Layers,
  Terminal,
  FileCode2,
  Users,
  BarChart3,
  Eye,
  X,
  Star,
  Download,
  RefreshCw,
  BadgeCheck,
  FolderDown,
  ArrowLeft,
  UploadCloud,
  FileArchive,
  Trash2,
} from 'lucide-react';

type ActiveRoute = '/' | '/command' | '/admin';
type CategoryFilter = 'all' | AssetCategory;

function getRouteFromLocation(): ActiveRoute {
  const path = window.location.pathname.toLowerCase();
  if (path === '/admin' || path.startsWith('/admin/')) return '/admin';
  if (path === '/command' || path.startsWith('/command/')) return '/command';
  return '/';
}

export default function App() {
  const [route, setRoute] = useState<ActiveRoute>(getRouteFromLocation);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Platform data state
  const [listings, setListings] = useState<BuiltSellListing[]>([]);
  const [profiles, setProfiles] = useState<BuiltSellProfile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<BuiltSellProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<BuiltSellListing | null>(null);
  const [commandTargetListing, setCommandTargetListing] = useState<BuiltSellListing | null>(null);
  const [acquiredIds, setAcquiredIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('builtsell_acquired_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Command / Download form state
  const [buyerNotes, setBuyerNotes] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('Node.js / Next.js Full-Stack Bundle');
  const [processingCommand, setProcessingCommand] = useState(false);

  // Auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Create / Upload Project state (100% Free)
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<AssetCategory>('ai_project');
  const [newAiModel, setNewAiModel] = useState('Gemini 2.5 Pro');
  const [newPromptText, setNewPromptText] = useState('');
  const [newCodeSnippet, setNewCodeSnippet] = useState('');
  const [newLanguage, setNewLanguage] = useState('TypeScript');
  const [newFramework, setNewFramework] = useState('Next.js + React');
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newDemoUrl, setNewDemoUrl] = useState('');
  const [newLicense, setNewLicense] = useState<BuiltSellListing['license_type']>('MIT Open Source');
  const [newTags] = useState('AI, Open Access, Production');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [creatingListing, setCreatingListing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const navigate = (nextRoute: ActiveRoute, targetItem?: BuiltSellListing) => {
    if (targetItem) {
      setCommandTargetListing(targetItem);
    }
    window.history.pushState({}, '', nextRoute);
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onPopState = () => setRoute(getRouteFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const showToast = (type: 'success' | 'info' | 'error', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  const openUploadModal = (defaultCat: AssetCategory = 'ai_project') => {
    if (!currentUserProfile) {
      setAuthMode('signup');
      setAuthModalOpen(true);
      showToast('info', 'Please sign in or create a free account to upload your project.');
      return;
    }
    setNewCategory(defaultCat);
    setCreateModalOpen(true);
  };

  const handleFilePicked = async (file: File | null) => {
    setSelectedFile(file);
    if (!file) return;

    // Auto-fill title if empty
    if (!newTitle.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      setNewTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }

    // If it's a text/code/prompt file under 150KB, auto-read a preview into the snippet/prompt box
    const readableExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.sql', '.json', '.md', '.txt', '.html', '.css'];
    const lower = file.name.toLowerCase();
    if (file.size < 150 * 1024 && readableExts.some((ext) => lower.endsWith(ext))) {
      try {
        const text = await file.text();
        if (newCategory === 'ai_prompt' && !newPromptText.trim()) {
          setNewPromptText(text.slice(0, 4000));
        } else if (!newCodeSnippet.trim()) {
          setNewCodeSnippet(text.slice(0, 4000));
        }
      } catch {
        // Ignore binary read errors
      }
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [{ data: listingsData }, { data: profilesData }, { data: sessionData }] = await Promise.all([
        supabase.from('builtsell_listings').select('*').order('created_at', { ascending: false }),
        supabase.from('builtsell_profiles').select('*').order('account_number', { ascending: true }),
        supabase.auth.getSession(),
      ]);

      if (listingsData) {
        const typedListings = listingsData as BuiltSellListing[];
        setListings(typedListings);
        if (!commandTargetListing && typedListings.length > 0) {
          setCommandTargetListing(typedListings[0]);
        }
      }
      if (profilesData) setProfiles(profilesData as BuiltSellProfile[]);

      const sessionUser = sessionData?.session?.user;
      if (sessionUser) {
        await ensureBuiltSellProfile(sessionUser.id, sessionUser.email || '', sessionUser.user_metadata?.full_name);
      } else {
        setCurrentUserProfile(null);
      }
    } catch (err) {
      console.error('Error loading BuiltSELL data:', err);
    } finally {
      setLoading(false);
    }
  };

  const ensureBuiltSellProfile = async (userId: string, userEmail: string, metaFullName?: string) => {
    const { data: existingProfile } = await supabase
      .from('builtsell_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      setCurrentUserProfile(existingProfile as BuiltSellProfile);
      return existingProfile as BuiltSellProfile;
    }

    const cleanUsername =
      (userEmail.split('@')[0] || 'creator').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() +
      '_' +
      userId.slice(0, 4);

    const { data: createdProfile, error: insertErr } = await supabase
      .from('builtsell_profiles')
      .insert({
        id: userId,
        email: userEmail,
        full_name: metaFullName || userEmail.split('@')[0] || 'BuiltSELL Creator',
        username: cleanUsername,
      })
      .select('*')
      .single();

    if (!insertErr && createdProfile) {
      setCurrentUserProfile(createdProfile as BuiltSellProfile);
      const { data: allProfiles } = await supabase
        .from('builtsell_profiles')
        .select('*')
        .order('account_number', { ascending: true });
      if (allProfiles) setProfiles(allProfiles as BuiltSellProfile[]);
      return createdProfile as BuiltSellProfile;
    }
    return null;
  };

  useEffect(() => {
    fetchAllData();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        ensureBuiltSellProfile(session.user.id, session.user.email || '', session.user.user_metadata?.full_name);
      } else {
        setCurrentUserProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName || email.split('@')[0] },
          },
        });

        if (error) throw error;

        if (data.user) {
          const prof = await ensureBuiltSellProfile(data.user.id, email, fullName);
          await fetchAllData();
          setAuthModalOpen(false);
          if (prof?.account_number === 1 || prof?.role === 'admin') {
            showToast('success', 'Welcome! Your founder account has been granted Admin access at /admin.');
          } else {
            showToast('success', `Welcome to BuiltSELL, ${prof?.full_name || email}!`);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (data.user) {
          const prof = await ensureBuiltSellProfile(data.user.id, data.user.email || email, fullName);
          await fetchAllData();
          setAuthModalOpen(false);
          showToast('success', `Signed in as ${prof?.full_name || email}.`);
        }
      }
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err: any) {
      showToast('error', err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUserProfile(null);
    if (route === '/admin') navigate('/');
    showToast('info', 'Signed out of BuiltSELL.');
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile) {
      setAuthModalOpen(true);
      return;
    }
    setCreatingListing(true);
    try {
      const slug =
        newTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') +
        '-' +
        Math.random().toString(36).substring(2, 6);

      let uploadedFileUrl: string | null = null;
      let uploadedFileName: string | null = null;
      let uploadedFileSize: number | null = null;

      // Upload attached project archive/file to storage bucket if selected
      if (selectedFile) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${currentUserProfile.id}/${slug}-${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('builtsell-projects')
          .upload(storagePath, selectedFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Project file upload failed: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('builtsell-projects')
          .getPublicUrl(storagePath);

        uploadedFileUrl = publicUrlData.publicUrl;
        uploadedFileName = selectedFile.name;
        uploadedFileSize = selectedFile.size;
      }

      const rawContentForHash = `${newTitle}|${newDescription}|${newPromptText}|${newCodeSnippet}|${uploadedFileName || ''}|${currentUserProfile.id}|${Date.now()}`;
      const fingerprint = await computeSha256Fingerprint(rawContentForHash);

      const parsedTags = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const { error } = await supabase.from('builtsell_listings').insert({
        author_id: currentUserProfile.id,
        author_name: currentUserProfile.full_name,
        title: newTitle,
        slug,
        summary: newSummary,
        description: newDescription,
        category: newCategory,
        price_usd: 0,
        ai_model: newCategory !== 'coding' ? newAiModel : null,
        prompt_text: newCategory === 'ai_prompt' ? newPromptText || '// Included in uploaded project file' : null,
        code_snippet: newCategory !== 'ai_prompt' ? newCodeSnippet || '// Full source code included in uploaded project archive' : null,
        programming_language: newCategory !== 'ai_prompt' ? newLanguage : 'Prompt DSL',
        framework: newFramework,
        repo_url: newRepoUrl || null,
        demo_url: newDemoUrl || null,
        project_file_url: uploadedFileUrl,
        project_file_name: uploadedFileName,
        project_file_size: uploadedFileSize,
        tags: parsedTags.length ? parsedTags : ['AI', 'BuiltSELL'],
        license_type: newLicense,
        copyright_holder: currentUserProfile.full_name,
        copyright_year: new Date().getFullYear(),
        content_fingerprint: fingerprint,
        status: 'published',
      });

      if (error) throw error;

      setCreateModalOpen(false);
      setNewTitle('');
      setNewSummary('');
      setNewDescription('');
      setNewPromptText('');
      setNewCodeSnippet('');
      setNewRepoUrl('');
      setNewDemoUrl('');
      setSelectedFile(null);
      await fetchAllData();
      showToast(
        'success',
        uploadedFileName
          ? `Project "${newTitle}" and file "${uploadedFileName}" uploaded for free!`
          : `Project "${newTitle}" published to BuiltSELL!`
      );
    } catch (err: any) {
      showToast('error', err.message || 'Could not upload project.');
    } finally {
      setCreatingListing(false);
    }
  };

  // Real File Download Handler: Downloads the uploaded project file if attached, or generates the source bundle
  const handleDownloadProjectBundle = async (item: BuiltSellListing) => {
    // Increment downloads_count in database
    const nextCount = (item.downloads_count || 0) + 1;
    setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, downloads_count: nextCount } : l)));
    supabase
      .from('builtsell_listings')
      .update({ downloads_count: nextCount })
      .eq('id', item.id)
      .then(() => {});

    // If creator uploaded a real project archive/file (.zip, .tar.gz, .py, .ts, etc.), trigger direct download
    if (item.project_file_url) {
      try {
        const response = await fetch(item.project_file_url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.project_file_name || `${item.slug}-project.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('success', `Downloading uploaded project file "${a.download}"!`);
        return;
      } catch {
        window.open(item.project_file_url, '_blank');
        return;
      }
    }

    // Fallback: Generate a structured source bundle file
    const isPrompt = item.category === 'ai_prompt';
    const isProject = item.category === 'ai_project';

    const bundleHeader = `====================================================================
BuiltSELL Free Project & Asset Package (100% Free Access)
Title: ${item.title}
Category: ${item.category.replace('_', ' ').toUpperCase()}
Author: ${item.author_name}
Framework / Stack: ${item.framework || 'Universal'}
Language / Model: ${item.programming_language || item.ai_model || 'Multi-Model'}
Access Tier: 100% Free (${item.license_type})
Downloaded At: ${new Date().toISOString()}
====================================================================

1. OVERVIEW & ARCHITECTURE
--------------------------
${item.summary}

${item.description}

2. ${isPrompt ? 'SYSTEM PROMPT & CHAIN PAYLOAD' : 'SOURCE CODE & IMPLEMENTATION'}
--------------------------------------------------------------------
${item.prompt_text || item.code_snippet || '// Full project starter template ready for deployment.'}

3. QUICKSTART CLI COMMANDS
--------------------------
${
  isPrompt
    ? '# Load prompt directly into your LLM pipeline:\nbuiltsell prompt run --slug ' + item.slug
    : '# Install & launch project locally:\ngit clone ' +
      (item.repo_url || `https://builtsell.io/repos/${item.slug}.git`) +
      '\ncd ' +
      item.slug +
      '\nnpm install && npm run dev'
}
`;

    const blob = new Blob([bundleHeader], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ext = isPrompt ? 'prompt.md' : isProject ? 'project-bundle.ts' : 'snippet.ts';
    a.href = url;
    a.download = `${item.slug}-${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('success', `Downloading "${a.download}" for free to your computer!`);
  };

  const handleConfirmCommandOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandTargetListing) return;
    setProcessingCommand(true);
    setTimeout(async () => {
      const updated = Array.from(new Set([...acquiredIds, commandTargetListing.id]));
      setAcquiredIds(updated);
      localStorage.setItem('builtsell_acquired_ids', JSON.stringify(updated));
      setProcessingCommand(false);
      await handleDownloadProjectBundle(commandTargetListing);
      setBuyerNotes('');
    }, 300);
  };

  const handleToggleListingStatus = async (listing: BuiltSellListing, nextStatus: 'published' | 'rejected' | 'pending') => {
    const { error } = await supabase
      .from('builtsell_listings')
      .update({ status: nextStatus })
      .eq('id', listing.id);
    if (!error) {
      showToast('success', `Listing "${listing.title}" status updated to ${nextStatus.toUpperCase()}.`);
      fetchAllData();
    } else {
      showToast('error', error.message);
    }
  };

  const handleToggleFeatured = async (listing: BuiltSellListing) => {
    const { error } = await supabase
      .from('builtsell_listings')
      .update({ is_featured: !listing.is_featured })
      .eq('id', listing.id);
    if (!error) {
      showToast('info', `Updated featured badge for "${listing.title}".`);
      fetchAllData();
    }
  };

  const handleToggleUserRole = async (targetProfile: BuiltSellProfile, newRole: 'user' | 'creator' | 'admin') => {
    const { error } = await supabase
      .from('builtsell_profiles')
      .update({ role: newRole, verified: newRole !== 'user' })
      .eq('id', targetProfile.id);
    if (!error) {
      showToast('success', `Updated ${targetProfile.full_name}'s role to ${newRole.toUpperCase()}.`);
      fetchAllData();
    } else {
      showToast('error', error.message);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      if (route !== '/admin' && item.status !== 'published') return false;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [listings, categoryFilter, searchQuery, route]);

  const noAccountRegisteredYet = profiles.length === 0;
  const isFirstAccountAdmin = currentUserProfile?.role === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Navigation Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-indigo-400 group-hover:text-cyan-300 transition-colors" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                    BuiltSELL
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    100% Free
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Free AI Projects • Prompts • Code Platform
                </p>
              </div>
            </button>

            {/* Primary Public Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => navigate('/')}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer flex items-center gap-2 ${
                  route === '/'
                    ? 'bg-slate-800/90 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Layers className="w-4 h-4 text-indigo-400" />
                Explore Projects
              </button>
              <button
                onClick={() => navigate('/command')}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer flex items-center gap-2 ${
                  route === '/command'
                    ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <FolderDown className="w-4 h-4 text-cyan-400" />
                Command & Download Hub
                {acquiredIds.length > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                    {acquiredIds.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => openUploadModal('ai_project')}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition cursor-pointer flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                Upload Project
              </button>
            </nav>
          </div>

          {/* Right Actions: Upload Project + Auth */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => openUploadModal('ai_project')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-md shadow-emerald-600/20 cursor-pointer transition"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Project</span>
            </button>

            {currentUserProfile ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="text-right hidden sm:block">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-semibold text-white">{currentUserProfile.full_name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase rounded bg-slate-800 text-slate-300">
                      Creator
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{currentUserProfile.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 cursor-pointer transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAuthMode('login');
                    setAuthModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 cursor-pointer transition flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4 text-indigo-400" />
                  Login
                </button>
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 cursor-pointer transition hidden sm:flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notification Banner */}
      {bannerMessage && (
        <div
          className={`border-b px-4 py-3 text-sm ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : bannerMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
              : 'bg-indigo-950/80 border-indigo-500/40 text-indigo-200'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{bannerMessage.text}</span>
            </div>
            <button onClick={() => setBannerMessage(null)} className="text-xs opacity-75 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* ROUTE 1: MARKETPLACE ('/') */}
        {route === '/' && (
          <>
            {/* Hero Section */}
            <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/50 p-6 sm:p-10 mb-8 shadow-2xl">
              <div className="relative z-10 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium mb-4">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>100% Free & Open Access — Upload & Download Full Projects</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                  Upload, Command & Download Free{' '}
                  <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
                    AI Projects, Prompts & Code
                  </span>
                </h1>
                <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed">
                  <strong>BuiltSELL</strong> is a completely free community hub where developers upload complete AI
                  project archives (<code>.zip</code>, source bundles, prompts, and code kits) for instant download.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => openUploadModal('ai_project')}
                    className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 hover:from-emerald-400 hover:to-cyan-400 transition shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Upload Your Project (.zip / Source / Prompt)
                  </button>
                  <button
                    onClick={() => navigate('/command')}
                    className="px-4 py-2.5 rounded-xl font-medium text-sm bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition cursor-pointer flex items-center gap-2"
                  >
                    <FolderDown className="w-4 h-4 text-cyan-400" />
                    Open Command & Download Hub
                  </button>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400">Free Assets</p>
                  <p className="text-xl font-bold text-white mt-0.5">
                    {listings.filter((l) => l.status === 'published').length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400">AI Projects</p>
                  <p className="text-xl font-bold text-cyan-400 mt-0.5">
                    {listings.filter((l) => l.category === 'ai_project' && l.status === 'published').length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400">AI Prompts</p>
                  <p className="text-xl font-bold text-amber-300 mt-0.5">
                    {listings.filter((l) => l.category === 'ai_prompt' && l.status === 'published').length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400">Platform Cost</p>
                  <p className="text-xl font-bold text-emerald-400 mt-0.5">100% FREE</p>
                </div>
              </div>
            </section>

            {/* Category Filters & Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex items-center gap-2 border ${
                    categoryFilter === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  All Free Assets ({listings.filter((l) => l.status === 'published').length})
                </button>
                <button
                  onClick={() => setCategoryFilter('ai_project')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex items-center gap-2 border ${
                    categoryFilter === 'ai_project'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  AI Projects (
                  {listings.filter((l) => l.category === 'ai_project' && l.status === 'published').length})
                </button>
                <button
                  onClick={() => setCategoryFilter('ai_prompt')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex items-center gap-2 border ${
                    categoryFilter === 'ai_prompt'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  AI Prompts (
                  {listings.filter((l) => l.category === 'ai_prompt' && l.status === 'published').length})
                </button>
                <button
                  onClick={() => setCategoryFilter('coding')}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex items-center gap-2 border ${
                    categoryFilter === 'coding'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  Coding & Kits (
                  {listings.filter((l) => l.category === 'coding' && l.status === 'published').length})
                </button>
              </div>

              <div className="relative min-w-[260px] sm:min-w-[320px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search free projects, prompts, or code..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Listings Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-80 rounded-2xl bg-slate-900/50 border border-slate-800 animate-pulse p-6"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map((item) => (
                  <div
                    key={item.id}
                    className="group rounded-2xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800/90 hover:border-indigo-500/50 transition-all duration-200 flex flex-col justify-between p-6 shadow-lg"
                  >
                    <div>
                      {/* Category + Free Badge Row */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            item.category === 'ai_project'
                              ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              : item.category === 'ai_prompt'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {item.category === 'ai_project' && <Cpu className="w-3.5 h-3.5" />}
                          {item.category === 'ai_prompt' && <Sparkles className="w-3.5 h-3.5" />}
                          {item.category === 'coding' && <Terminal className="w-3.5 h-3.5" />}
                          {item.category === 'ai_project'
                            ? 'AI Project'
                            : item.category === 'ai_prompt'
                            ? 'AI Prompt'
                            : 'Coding Asset'}
                        </span>

                        <div className="flex items-center gap-2">
                          {item.project_file_name && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                              <FileArchive className="w-3 h-3" />
                              Archive
                            </span>
                          )}
                          <span className="text-xs font-extrabold text-emerald-300 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                            FREE
                          </span>
                        </div>
                      </div>

                      {/* Title & Summary */}
                      <h3
                        onClick={() => setSelectedListing(item)}
                        className="text-lg font-bold text-white group-hover:text-indigo-300 transition cursor-pointer line-clamp-2"
                      >
                        {item.title}
                      </h3>
                      <p className="mt-2 text-xs sm:text-sm text-slate-400 line-clamp-2">{item.summary}</p>

                      {/* Technical Metadata Pills */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {item.ai_model && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-indigo-300 font-mono">
                            {item.ai_model}
                          </span>
                        )}
                        {item.programming_language && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-cyan-300 font-mono">
                            {item.programming_language}
                          </span>
                        )}
                        {item.framework && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                            {item.framework}
                          </span>
                        )}
                        {item.project_file_name && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono">
                            {item.project_file_name} ({formatBytes(item.project_file_size)})
                          </span>
                        )}
                      </div>

                      {/* Code or Prompt Preview Snippet */}
                      {(item.prompt_text || item.code_snippet) && (
                        <div className="mt-4 rounded-xl bg-slate-950/90 border border-slate-800/90 p-3 font-mono text-[11px] text-slate-300 relative">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 pb-1 border-b border-slate-900">
                            <span>{item.prompt_text ? 'PROMPT PREVIEW' : 'CODE SNIPPET'}</span>
                            <button
                              onClick={() =>
                                copyToClipboard(item.prompt_text || item.code_snippet || '', item.id)
                              }
                              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 cursor-pointer"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Copy
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap line-clamp-3 text-slate-300">
                            {item.prompt_text || item.code_snippet}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="mt-5 pt-4 border-t border-slate-800/80">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            {item.rating}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            {item.downloads_count}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedListing(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Inspect
                          </button>
                          <button
                            onClick={() => navigate('/command', item)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <FolderDown className="w-3.5 h-3.5" />
                            Free Download
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ROUTE 2: COMMAND & FREE DOWNLOAD HUB ('/command') */}
        {route === '/command' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Marketplace
              </button>
              <button
                onClick={() => openUploadModal('ai_project')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Upload New Project
              </button>
            </div>

            {/* Command Header */}
            <div className="rounded-3xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-cyan-950/50 border border-indigo-500/30 p-6 sm:p-8 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <FolderDown className="w-3.5 h-3.5" />
                    BuiltSELL Free Command & Project Download Center
                  </span>
                  <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-2">
                    Command Assets & Download Projects for Free
                  </h2>
                  <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                    Every AI Project, Prompt Chain, and Coding Kit on BuiltSELL is 100% free. Select any project below
                    to download its uploaded archive or source bundle immediately.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Asset Selector + Free Command Form */}
              <div className="lg:col-span-7 space-y-6">
                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    1. Select Free Project or Asset
                  </h3>

                  <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto pr-1">
                    {listings
                      .filter((l) => l.status === 'published')
                      .map((item) => {
                        const isSelected = commandTargetListing?.id === item.id;
                        const isDownloaded = acquiredIds.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => setCommandTargetListing(item)}
                            className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between gap-4 ${
                              isSelected
                                ? 'bg-indigo-950/50 border-indigo-500 shadow-md'
                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                                  {item.category.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                  FREE
                                </span>
                                {item.project_file_name && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                                    {item.project_file_name}
                                  </span>
                                )}
                                {isDownloaded && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                                    Downloaded
                                  </span>
                                )}
                              </div>
                              <p className="font-bold text-white text-sm mt-1 truncate">{item.title}</p>
                              <p className="text-xs text-slate-400 truncate">{item.summary}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadProjectBundle(item);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Free Download
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Step 2: Free Command Configuration Form */}
                {commandTargetListing && (
                  <form
                    onSubmit={handleConfirmCommandOrder}
                    className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-4"
                  >
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <FolderDown className="w-5 h-5 text-cyan-400" />
                      2. Configure & Download "{commandTargetListing.title}"
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Target Runtime / Package Format
                        </label>
                        <select
                          value={selectedEnvironment}
                          onChange={(e) => setSelectedEnvironment(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                        >
                          <option value="Node.js / Next.js Full-Stack Bundle">
                            Node.js / Next.js Full-Stack Bundle
                          </option>
                          <option value="React + Vite Standalone Package">React + Vite Standalone Package</option>
                          <option value="Python / FastAPI Agent Runtime">Python / FastAPI Agent Runtime</option>
                          <option value="Raw Prompt / Markdown + JSON Schema">
                            Raw Prompt / Markdown + JSON Schema
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Included Project File</label>
                        <input
                          type="text"
                          readOnly
                          value={
                            commandTargetListing.project_file_name
                              ? `${commandTargetListing.project_file_name} (${formatBytes(commandTargetListing.project_file_size)})`
                              : 'Auto-Generated Source Bundle'
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-emerald-400 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Custom Deployment Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={buyerNotes}
                        onChange={(e) => setBuyerNotes(e.target.value)}
                        placeholder="e.g. Include Docker & environment template..."
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                      />
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="text-xs text-slate-400">Access Cost:</span>
                        <p className="text-2xl font-extrabold text-emerald-400">FREE — No Payment Required</p>
                      </div>

                      <button
                        type="submit"
                        disabled={processingCommand}
                        className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-lg shadow-indigo-600/25 cursor-pointer flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        {processingCommand ? 'Preparing Free Bundle...' : 'Download Free Project Now'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Right Column: Instant CLI Pull & Direct Source Preview */}
              <div className="lg:col-span-5 space-y-6">
                {commandTargetListing && (
                  <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-5">
                    <div>
                      <span className="text-xs font-mono uppercase text-emerald-400">Direct CLI & Source Access</span>
                      <h3 className="text-lg font-bold text-white mt-1">{commandTargetListing.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">{commandTargetListing.description}</p>
                    </div>

                    {/* CLI Pull Command Box */}
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs">
                      <div className="flex items-center justify-between text-slate-400 pb-2 mb-2 border-b border-slate-900">
                        <span className="flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                          QUICK CLI CLONE COMMAND
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              `npx builtsell-cli@latest pull ${commandTargetListing.slug}`,
                              'cli-' + commandTargetListing.id
                            )
                          }
                          className="text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1"
                        >
                          {copiedId === 'cli-' + commandTargetListing.id ? 'Copied!' : 'Copy CLI'}
                        </button>
                      </div>
                      <code className="text-emerald-300 block overflow-x-auto">
                        $ npx builtsell-cli@latest pull {commandTargetListing.slug}
                      </code>
                    </div>

                    {/* Embedded Code / Prompt Preview */}
                    {(commandTargetListing.prompt_text || commandTargetListing.code_snippet) && (
                      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs">
                        <div className="flex items-center justify-between text-slate-400 pb-2 mb-2 border-b border-slate-900">
                          <span>INCLUDED PROJECT / PROMPT SOURCE</span>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                commandTargetListing.prompt_text || commandTargetListing.code_snippet || '',
                                'src-' + commandTargetListing.id
                              )
                            }
                            className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
                          >
                            {copiedId === 'src-' + commandTargetListing.id ? 'Copied!' : 'Copy Source'}
                          </button>
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-slate-300 max-h-60">
                          {commandTargetListing.prompt_text || commandTargetListing.code_snippet}
                        </pre>
                      </div>
                    )}

                    {/* Direct One-Click File Download Button */}
                    <button
                      onClick={() => handleDownloadProjectBundle(commandTargetListing)}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <FolderDown className="w-4 h-4 text-cyan-400" />
                      {commandTargetListing.project_file_name
                        ? `Download Uploaded Archive (${commandTargetListing.project_file_name})`
                        : `Download Raw Project File (${commandTargetListing.slug})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 3: HIDDEN ADMIN PANEL ('/admin' PATH ONLY) */}
        {route === '/admin' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Public Marketplace
              </button>
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                Private Route: /admin
              </span>
            </div>

            {/* Admin Header Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-amber-950/60 via-slate-900 to-indigo-950/60 border border-amber-500/40 p-6 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold">
                    <Crown className="w-4 h-4" />
                    PRIVATE ADMINISTRATION PORTAL (/admin)
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
                    BuiltSELL Command & Moderation Center
                  </h2>
                  <p className="text-sm text-slate-300 mt-1">
                    Hidden from public navigation. Restricted to the first registered founder account (#1).
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchAllData}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm font-medium text-white border border-slate-700 cursor-pointer flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Data
                  </button>
                </div>
              </div>
            </div>

            {!isFirstAccountAdmin ? (
              <div className="rounded-2xl bg-slate-900/90 border border-amber-500/40 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <Lock className="w-6 h-6 text-amber-400 shrink-0 mt-1" />
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {noAccountRegisteredYet
                        ? 'Founder Admin (#1) Unclaimed — Register First Account'
                        : 'Restricted to Founder Admin (#1)'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1">
                      {noAccountRegisteredYet
                        ? 'No user has registered yet. Sign up now to claim Account #1 and unlock full Admin Panel privileges.'
                        : 'Please sign in with the first registered administrator account to manage users and listings.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAuthMode(noAccountRegisteredYet ? 'signup' : 'login');
                    setAuthModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shrink-0 cursor-pointer transition"
                >
                  {noAccountRegisteredYet ? 'Register First Account (#1)' : 'Sign In as Admin'}
                </button>
              </div>
            ) : (
              <>
                {/* Admin KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Registered Accounts</span>
                      <Users className="w-4 h-4 text-indigo-400" />
                    </div>
                    <p className="text-2xl font-extrabold text-white mt-2">{profiles.length}</p>
                  </div>

                  <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Free Marketplace Listings</span>
                      <BarChart3 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <p className="text-2xl font-extrabold text-white mt-2">{listings.length}</p>
                    <p className="text-xs text-emerald-400 mt-1">
                      {listings.filter((l) => l.status === 'published').length} Published •{' '}
                      {listings.filter((l) => l.status !== 'published').length} Hidden
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Featured Assets</span>
                      <Star className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-2xl font-extrabold text-white mt-2">
                      {listings.filter((l) => l.is_featured).length}
                    </p>
                  </div>
                </div>

                {/* Section 1: Registered Users */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-400" />
                        Registered Users
                      </h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase text-slate-400">
                          <th className="py-3 px-4">Order #</th>
                          <th className="py-3 px-4">Full Name & Email</th>
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">Joined</th>
                          <th className="py-3 px-4 text-right">Role Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {profiles.map((prof) => (
                          <tr key={prof.id} className="hover:bg-slate-900/90">
                            <td className="py-3 px-4 font-mono text-xs">
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  prof.account_number === 1
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                #{prof.account_number}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                {prof.full_name}
                                {prof.verified && <BadgeCheck className="w-4 h-4 text-cyan-400" />}
                              </div>
                              <div className="text-xs text-slate-400">{prof.email}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-300">@{prof.username}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                                  prof.role === 'admin'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : prof.role === 'creator'
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {prof.role}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-400">
                              {new Date(prof.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleToggleUserRole(prof, 'creator')}
                                  className="px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 text-xs cursor-pointer"
                                >
                                  Verify Creator
                                </button>
                                <button
                                  onClick={() => handleToggleUserRole(prof, 'admin')}
                                  className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 text-xs cursor-pointer"
                                >
                                  Make Admin
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 2: Marketplace Listings Moderation */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-cyan-400" />
                      AI Projects, Prompts & Code Moderation Queue
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase text-slate-400">
                          <th className="py-3 px-4">Asset Title</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Uploaded Archive</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Moderation Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {listings.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/90">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{item.title}</div>
                              <div className="text-xs text-slate-400">by {item.author_name}</div>
                            </td>
                            <td className="py-3 px-4 text-xs uppercase font-mono text-indigo-300">
                              {item.category.replace('_', ' ')}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-cyan-300">
                              {item.project_file_name || 'Source Snippet'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  item.status === 'published'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleToggleFeatured(item)}
                                  className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                                    item.is_featured
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {item.is_featured ? '★ Featured' : '☆ Feature'}
                                </button>
                                {item.status === 'published' ? (
                                  <button
                                    onClick={() => handleToggleListingStatus(item, 'rejected')}
                                    className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs cursor-pointer"
                                  >
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleListingStatus(item, 'published')}
                                    className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-xs cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* MODAL 1: SIGN UP & LOGIN */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <Cpu className="w-4 h-4" />
              BuiltSELL Free Account Portal
            </div>
            <h3 className="text-2xl font-bold text-white mt-1">
              {authMode === 'signup' ? 'Create Your Free BuiltSELL Account' : 'Sign In to BuiltSELL'}
            </h3>

            <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name / Studio Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@builtsell.io"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-lg cursor-pointer transition disabled:opacity-50"
              >
                {authSubmitting ? 'Authenticating...' : authMode === 'signup' ? 'Create Free Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
              {authMode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => setAuthMode('login')}
                    className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  Need a BuiltSELL account?{' '}
                  <button
                    onClick={() => setAuthMode('signup')}
                    className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Sign Up Free
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: UPLOAD PROJECT / PROMPT / CODE */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative my-8">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
              <UploadCloud className="w-4 h-4" />
              Upload Project & Source Bundle (100% Free)
            </div>
            <h3 className="text-xl font-bold text-white mt-1">
              Upload Your AI Project, Prompt, or Code Package
            </h3>

            <form onSubmit={handleCreateListing} className="mt-4 space-y-4">
              {/* Drag & Drop Project Archive / File Upload Zone */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Project Archive or Source File (.zip, .tar.gz, .py, .ts, .tsx, .json, .md — up to 50 MB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.tar,.gz,.tgz,.7z,.py,.ts,.tsx,.js,.jsx,.json,.md,.txt,.sql,.html,.css"
                  onChange={(e) => handleFilePicked(e.target.files?.[0] || null)}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) handleFilePicked(dropped);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed p-5 text-center transition cursor-pointer ${
                    isDraggingFile
                      ? 'border-emerald-400 bg-emerald-500/10'
                      : selectedFile
                      ? 'border-cyan-500/60 bg-cyan-950/20'
                      : 'border-slate-700 hover:border-indigo-500 bg-slate-950/60'
                  }`}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
                          <FileArchive className="w-5 h-5 text-cyan-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{selectedFile.name}</p>
                          <p className="text-xs text-emerald-400 font-mono">
                            {formatBytes(selectedFile.size)} • Ready to upload
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2">
                      <UploadCloud className="w-8 h-8 text-indigo-400 mb-2" />
                      <p className="text-sm font-semibold text-white">
                        Click to select or drag & drop your project file here
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Supports full <code>.zip</code> project folders, code scripts, or prompt files
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as AssetCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  >
                    <option value="ai_project">AI Project</option>
                    <option value="ai_prompt">AI Prompt</option>
                    <option value="coding">Coding / Component</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Open Usage License</label>
                  <select
                    value={newLicense}
                    onChange={(e) => setNewLicense(e.target.value as BuiltSellListing['license_type'])}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  >
                    <option value="MIT Open Source">MIT Open Source (Free)</option>
                    <option value="Commercial License">Free Commercial Use</option>
                    <option value="Personal Use">Free Personal Use</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Autonomous SQL Optimizer Agent + Full Source"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Short Summary</label>
                <input
                  type="text"
                  required
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="One-sentence summary of what your uploaded project does..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {newCategory === 'coding' ? 'Programming Language' : 'Target AI Model'}
                  </label>
                  <input
                    type="text"
                    value={newCategory === 'coding' ? newLanguage : newAiModel}
                    onChange={(e) =>
                      newCategory === 'coding' ? setNewLanguage(e.target.value) : setNewAiModel(e.target.value)
                    }
                    placeholder="e.g. Gemini 2.5 Pro / TypeScript"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Framework / Tech Stack</label>
                  <input
                    type="text"
                    value={newFramework}
                    onChange={(e) => setNewFramework(e.target.value)}
                    placeholder="e.g. Next.js + Tailwind + Python"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    GitHub / Repository URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={newRepoUrl}
                    onChange={(e) => setNewRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/project"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Live Demo URL (Optional)</label>
                  <input
                    type="url"
                    value={newDemoUrl}
                    onChange={(e) => setNewDemoUrl(e.target.value)}
                    placeholder="https://your-demo-url.app"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {newCategory === 'ai_prompt'
                    ? 'Prompt Template / System Instructions'
                    : 'Preview Code Snippet / Entrypoint (Optional if file uploaded)'}
                </label>
                <textarea
                  rows={3}
                  required={!selectedFile}
                  value={newCategory === 'ai_prompt' ? newPromptText : newCodeSnippet}
                  onChange={(e) =>
                    newCategory === 'ai_prompt'
                      ? setNewPromptText(e.target.value)
                      : setNewCodeSnippet(e.target.value)
                  }
                  placeholder={
                    newCategory === 'ai_prompt'
                      ? 'Paste the prompt chain or system instructions...'
                      : 'Paste the core entrypoint or code preview...'
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">README & Setup Instructions</label>
                <textarea
                  rows={2}
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe how to install, configure, and run your project..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingListing}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-sm cursor-pointer flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  {creatingListing ? 'Uploading Project...' : 'Upload & Publish Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ASSET DETAIL */}
      {selectedListing && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl relative my-8">
            <button
              onClick={() => setSelectedListing(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/20 text-indigo-300">
                {selectedListing.category.replace('_', ' ').toUpperCase()}
              </span>
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/20 text-emerald-300">
                100% FREE
              </span>
              {selectedListing.project_file_name && (
                <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {selectedListing.project_file_name} ({formatBytes(selectedListing.project_file_size)})
                </span>
              )}
            </div>

            <h3 className="text-2xl font-bold text-white mt-3">{selectedListing.title}</h3>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">{selectedListing.description}</p>

            {(selectedListing.prompt_text || selectedListing.code_snippet) && (
              <div className="mt-5 rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200">
                <div className="flex items-center justify-between text-slate-400 pb-2 mb-2 border-b border-slate-800">
                  <span>SOURCE PAYLOAD</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        selectedListing.prompt_text || selectedListing.code_snippet || '',
                        selectedListing.id
                      )
                    }
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === selectedListing.id ? 'Copied!' : 'Copy Payload'}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap">
                  {selectedListing.prompt_text || selectedListing.code_snippet}
                </pre>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <div className="text-lg font-extrabold text-emerald-400">Free Instant Download</div>
              <div className="flex items-center gap-3">
                {selectedListing.repo_url && (
                  <a
                    href={selectedListing.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"
                  >
                    Repository <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => handleDownloadProjectBundle(selectedListing)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-xs sm:text-sm font-semibold text-white cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  {selectedListing.project_file_name ? 'Download Project File' : 'Download Bundle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Minimal Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-4 sm:px-6 mt-16">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-white">BuiltSELL</span>
            <span>— 100% Free AI Projects, Prompts & Coding Platform</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="hover:text-white cursor-pointer">
              Explore Projects
            </button>
            <button onClick={() => openUploadModal('ai_project')} className="hover:text-white cursor-pointer">
              Upload Project
            </button>
            <button onClick={() => navigate('/command')} className="hover:text-white cursor-pointer">
              Command & Download
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
