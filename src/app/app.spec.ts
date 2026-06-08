import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let httpController: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  function flushConfigIfRequested(): void {
    const configRequests = httpController.match('/api/config');
    configRequests.forEach((request) => request.flush({ googleClientId: '' }));
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushConfigIfRequested();

    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render TODO title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushConfigIfRequested();

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('TODO App');
  });
});
