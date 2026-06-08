import { HttpClient, httpResource } from '@angular/common/http';
import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface AppConfig {
  googleClientId: string;
}

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

interface UserSession {
  token: string;
  name: string;
  email: string;
  picture: string;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleWindow {
  google?: {
    accounts?: {
      id?: {
        initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
        renderButton(
          parent: HTMLElement,
          options: { theme: string; size: string; text: string; shape: string; width: number }
        ): void;
      };
    };
  };
}

const SESSION_STORAGE_KEY = 'todo-app-session';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  @ViewChild('googleButton', { static: false })
  protected googleButton?: ElementRef<HTMLDivElement>;

  private readonly http = inject(HttpClient);

  protected readonly newTodoTitle = signal('');
  protected readonly errorMessage = signal('');
  protected readonly googleScriptReady = signal(false);
  protected readonly session = signal<UserSession | null>(this.readSessionFromStorage());

  protected readonly configResource = httpResource<AppConfig>(() => '/api/config');
  protected readonly todosResource = httpResource<Todo[]>(() => {
    const session = this.session();
    if (!session) {
      return undefined;
    }

    return {
      url: '/api/todos',
      headers: {
        Authorization: this.buildAuthorizationHeader(session)
      }
    };
  });

  protected readonly googleClientId = computed(() => this.configResource.value()?.googleClientId ?? '');
  protected readonly todos = computed(() => {
    if (!this.session()) {
      return [];
    }

    return this.todosResource.value() ?? [];
  });

  constructor() {
    effect(() => {
      if (!this.googleScriptReady() || !this.googleClientId() || this.session()) {
        return;
      }

      queueMicrotask(() => {
        this.renderGoogleButton();
      });
    });
  }

  ngAfterViewInit(): void {
    this.loadGoogleScript();
  }

  protected addTodo(): void {
    this.errorMessage.set('');
    const title = this.newTodoTitle().trim();
    if (!title) {
      return;
    }

    const session = this.session();
    if (!session) {
      this.errorMessage.set('Please sign in with Google first.');
      return;
    }

    this.http
      .post('/api/todos', { title }, { headers: { Authorization: this.buildAuthorizationHeader(session) } })
      .subscribe({
        next: () => {
          this.newTodoTitle.set('');
          this.todosResource.reload();
        },
        error: () => {
          this.errorMessage.set('Could not save TODO. Please try again.');
        }
      });
  }

  protected toggleTodo(todo: Todo): void {
    const session = this.session();
    if (!session) {
      return;
    }

    this.errorMessage.set('');
    this.http
      .patch(
        `/api/todos/${todo.id}`,
        { completed: !todo.completed },
        { headers: { Authorization: this.buildAuthorizationHeader(session) } }
      )
      .subscribe({
        next: () => {
          this.todosResource.reload();
        },
        error: () => {
          this.errorMessage.set('Could not update TODO.');
        }
      });
  }

  protected deleteTodo(todoId: number): void {
    const session = this.session();
    if (!session) {
      return;
    }

    this.errorMessage.set('');
    this.http
      .delete(`/api/todos/${todoId}`, {
        headers: { Authorization: this.buildAuthorizationHeader(session) }
      })
      .subscribe({
        next: () => {
          this.todosResource.reload();
        },
        error: () => {
          this.errorMessage.set('Could not delete TODO.');
        }
      });
  }

  protected logout(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    this.session.set(null);
    this.errorMessage.set('');
  }

  protected isSignedIn(): boolean {
    return this.session() !== null;
  }

  private loadGoogleScript(): void {
    const googleWindow = window as GoogleWindow;
    if (googleWindow.google?.accounts?.id) {
      this.googleScriptReady.set(true);
      return;
    }

    const existingScript = document.getElementById('google-signin-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => this.googleScriptReady.set(true), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-signin-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.googleScriptReady.set(true);
    document.head.appendChild(script);
  }

  private renderGoogleButton(): void {
    const googleWindow = window as GoogleWindow;
    const clientId = this.googleClientId();
    const buttonContainer = this.googleButton?.nativeElement;

    if (!googleWindow.google?.accounts?.id || !buttonContainer || !clientId) {
      return;
    }

    buttonContainer.innerHTML = '';

    googleWindow.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => this.handleGoogleCredential(response)
    });

    googleWindow.google.accounts.id.renderButton(buttonContainer, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 270
    });
  }

  private handleGoogleCredential(response: GoogleCredentialResponse): void {
    if (!response.credential) {
      this.errorMessage.set('Google sign-in failed. Please try again.');
      return;
    }

    const identity = this.parseCredential(response.credential);
    if (!identity) {
      this.errorMessage.set('Could not read Google profile data.');
      return;
    }

    const nextSession: UserSession = {
      token: response.credential,
      name: identity.name,
      email: identity.email,
      picture: identity.picture
    };

    this.session.set(nextSession);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    this.errorMessage.set('');
    this.todosResource.reload();
  }

  private readSessionFromStorage(): UserSession | null {
    try {
      const rawValue = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }

      const session = JSON.parse(rawValue) as UserSession;
      if (!session.token) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  private parseCredential(credential: string): { name: string; email: string; picture: string } | null {
    try {
      const payloadPart = credential.split('.')[1];
      if (!payloadPart) {
        return null;
      }

      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
      const decoded = atob(padded);
      const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
        name?: string;
        email?: string;
        picture?: string;
      };

      return {
        name: payload.name || 'Unknown user',
        email: payload.email || '',
        picture: payload.picture || ''
      };
    } catch {
      return null;
    }
  }

  private buildAuthorizationHeader(session: UserSession): string {
    return ['Bearer', session.token].join(' ');
  }
}
